// 파라미터 그리드서치 최적화 + 과적합 검증(PBO/DSR)
// 여러 설정을 한 번에 백테스트하고, "최고 설정"이 선택편향인지 CSCV로 정량 평가한다.

import type { Bar, StrategyId, StrategyParams, BacktestConfig } from "./types";
import { generateSignals } from "./strategies";
import { runBacktest } from "./backtest";
import { cscvPBO, deflatedSharpe, sharpePerPeriod, skewness, kurtosis } from "./validation";

export type ParamGridDef = Record<string, number[]>;

export const PARAM_GRIDS: Record<string, ParamGridDef> = {
  ma_crossover: { fast: [5, 10, 20, 30], slow: [40, 60, 100, 150] },
  rsi_reversion: { rsiPeriod: [7, 14, 21], oversold: [20, 30], overbought: [70, 80] },
  macd: { macdFast: [8, 12], macdSlow: [21, 26], macdSignal: [9] },
  bollinger_reversion: { bbPeriod: [10, 20, 30], bbK: [1.5, 2, 2.5] },
  donchian_breakout: { channel: [10, 20, 30, 40] },
};

export interface OptConfigResult {
  params: StrategyParams;
  sharpe: number;
  totalReturn: number;
  maxDrawdown: number;
  trades: number;
}

export interface OptimizeResult {
  strategy: StrategyId;
  configs: OptConfigResult[]; // 샤프 내림차순
  best: OptConfigResult;
  trials: number;
  pbo: number;
  pboCombinations: number;
  dsr: number;
  bestSharpe: number;
  expectedMaxSharpe: number;
}

function cartesian(grid: ParamGridDef): StrategyParams[] {
  const keys = Object.keys(grid);
  let combos: StrategyParams[] = [{}];
  for (const key of keys) {
    const next: StrategyParams[] = [];
    for (const c of combos) {
      for (const v of grid[key]) {
        next.push({ ...c, [key]: v });
      }
    }
    combos = next;
  }
  return combos;
}

function curveReturns(equity: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    out.push(equity[i - 1] === 0 ? 0 : equity[i] / equity[i - 1] - 1);
  }
  return out;
}

export function optimize(
  bars: Bar[],
  strategy: StrategyId,
  btCfg: Partial<BacktestConfig>,
  maxConfigs = 64
): OptimizeResult {
  const grid = PARAM_GRIDS[strategy] ?? {};
  let combos = cartesian(grid);
  if (combos.length > maxConfigs) combos = combos.slice(0, maxConfigs);
  if (combos.length === 0) combos = [{}];

  const results: OptConfigResult[] = [];
  const returnsCols: number[][] = []; // 설정별 봉수익률
  const perPeriodSharpes: number[] = [];

  for (const params of combos) {
    const signals = generateSignals(bars, strategy, params);
    const res = runBacktest(bars, signals, btCfg, 0);
    const rets = curveReturns(res.equityCurve.map((p) => p.equity));
    returnsCols.push(rets);
    perPeriodSharpes.push(sharpePerPeriod(rets));
    results.push({
      params,
      sharpe: res.metrics.sharpe,
      totalReturn: res.metrics.totalReturn,
      maxDrawdown: res.metrics.maxDrawdown,
      trades: res.trades.length,
    });
  }

  // 동일 길이 정렬 (가장 짧은 컬럼 기준)
  const minLen = Math.min(...returnsCols.map((c) => c.length));
  const matrix: number[][] = [];
  for (let t = 0; t < minLen; t++) {
    matrix.push(returnsCols.map((col) => col[col.length - minLen + t]));
  }

  const pboRes = cscvPBO(matrix, 8);

  // DSR: 최고 샤프 설정 기준
  let bestIdx = 0;
  for (let i = 1; i < results.length; i++) if (results[i].sharpe > results[bestIdx].sharpe) bestIdx = i;
  const bestRets = returnsCols[bestIdx];
  const dsrRes = deflatedSharpe(perPeriodSharpes, bestRets.length, skewness(bestRets), kurtosis(bestRets));

  const ranked = [...results].sort((a, b) => b.sharpe - a.sharpe);

  return {
    strategy,
    configs: ranked,
    best: ranked[0],
    trials: combos.length,
    pbo: pboRes.pbo,
    pboCombinations: pboRes.combinations,
    dsr: dsrRes.dsr,
    bestSharpe: dsrRes.bestSharpe,
    expectedMaxSharpe: dsrRes.expectedMaxSharpe,
  };
}
