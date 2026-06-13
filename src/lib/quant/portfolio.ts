// 다종목 포트폴리오 백테스트 (동일가중 리밸런싱)
// 각 종목에 자본을 균등 배분해 동일 전략을 적용하고, 날짜 기준으로 합산한다.

import type { Bar, StrategyId, StrategyParams, BacktestConfig } from "./types";
import { generateSignals } from "./strategies";
import { runBacktest } from "./backtest";

export interface SymbolSeries {
  symbol: string;
  bars: Bar[];
}

export interface PortfolioPoint {
  time: string;
  portfolio: number;
  benchmark: number;
}

export interface PortfolioSymbolResult {
  symbol: string;
  totalReturn: number;
  sharpe: number;
  maxDrawdown: number;
  trades: number;
}

export interface PortfolioResult {
  equity: PortfolioPoint[];
  perSymbol: PortfolioSymbolResult[];
  metrics: {
    totalReturn: number;
    cagr: number;
    sharpe: number;
    maxDrawdown: number;
    volatility: number;
    benchmarkReturn: number;
    alpha: number;
  };
}

export function portfolioBacktest(
  series: SymbolSeries[],
  strategy: StrategyId,
  params: StrategyParams,
  btCfg: Partial<BacktestConfig>,
  periodsPerYear = 252
): PortfolioResult {
  const valid = series.filter((s) => s.bars.length >= 30);
  const N = valid.length;
  const initialCapital = btCfg.initialCapital ?? 10_000_000;
  const capEach = N > 0 ? initialCapital / N : initialCapital;

  const perSymbol: PortfolioSymbolResult[] = [];
  const allTimes = new Set<string>();

  // 각 종목 시계열을 time→value 로 저장 (forward-fill 대상)
  const stratByTime: Map<string, number>[] = [];
  const benchByTime: Map<string, number>[] = [];

  for (const s of valid) {
    const signals = generateSignals(s.bars, strategy, params);
    const res = runBacktest(s.bars, signals, { ...btCfg, initialCapital: capEach }, 0);
    perSymbol.push({
      symbol: s.symbol,
      totalReturn: res.metrics.totalReturn,
      sharpe: res.metrics.sharpe,
      maxDrawdown: res.metrics.maxDrawdown,
      trades: res.trades.length,
    });
    const sMap = new Map<string, number>();
    const bMap = new Map<string, number>();
    for (const p of res.equityCurve) {
      const day = p.time.slice(0, 10);
      sMap.set(day, p.equity);
      bMap.set(day, p.buyHold);
      allTimes.add(day);
    }
    stratByTime.push(sMap);
    benchByTime.push(bMap);
  }

  const times = [...allTimes].sort();
  const equity: PortfolioPoint[] = [];
  // forward-fill: 각 종목의 마지막 알려진 값 유지
  const lastStrat = Array(N).fill(capEach);
  const lastBench = Array(N).fill(capEach);

  for (const t of times) {
    let pSum = 0;
    let bSum = 0;
    for (let i = 0; i < N; i++) {
      if (stratByTime[i].has(t)) lastStrat[i] = stratByTime[i].get(t) as number;
      if (benchByTime[i].has(t)) lastBench[i] = benchByTime[i].get(t) as number;
      pSum += lastStrat[i];
      bSum += lastBench[i];
    }
    equity.push({ time: t, portfolio: pSum, benchmark: bSum });
  }

  // 포트폴리오 지표
  const rets: number[] = [];
  let peak = equity[0]?.portfolio ?? initialCapital;
  let maxDD = 0;
  for (let i = 1; i < equity.length; i++) {
    const r = equity[i - 1].portfolio === 0 ? 0 : equity[i].portfolio / equity[i - 1].portfolio - 1;
    rets.push(r);
    peak = Math.max(peak, equity[i].portfolio);
    maxDD = Math.min(maxDD, peak > 0 ? equity[i].portfolio / peak - 1 : 0);
  }
  const finalEq = equity.length ? equity[equity.length - 1].portfolio : initialCapital;
  const finalBench = equity.length ? equity[equity.length - 1].benchmark : initialCapital;
  const totalReturn = finalEq / initialCapital - 1;
  const benchmarkReturn = finalBench / initialCapital - 1;
  const years = equity.length / periodsPerYear;
  const cagr = years > 0 && finalEq > 0 ? Math.pow(finalEq / initialCapital, 1 / years) - 1 : 0;
  const meanR = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const stdR = rets.length ? Math.sqrt(rets.reduce((a, b) => a + (b - meanR) ** 2, 0) / rets.length) : 0;
  const ann = Math.sqrt(periodsPerYear);

  return {
    equity,
    perSymbol,
    metrics: {
      totalReturn,
      cagr,
      sharpe: stdR === 0 ? 0 : (meanR / stdR) * ann,
      maxDrawdown: maxDD,
      volatility: stdR * ann,
      benchmarkReturn,
      alpha: totalReturn - benchmarkReturn,
    },
  };
}
