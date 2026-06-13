// 워크포워드 시뮬레이션: 학습창 → 검증창을 슬라이딩하며 반복.
// "5월까지 학습 → 6월 N일 모의매매"를 여러 기간에 대해 반복하는 정확한 구현.
// 각 폴드는 아웃오브샘플(미래 데이터 미사용)이며, 검증 구간을 이어붙여 OOS 자산곡선을 만든다.

import type { Bar, StrategyId, StrategyParams, BacktestConfig } from "./types";
import { generateSignals } from "./strategies";
import { runBacktest } from "./backtest";
import { runML, type MLConfig } from "./ml";
import { runRL, type RLConfig } from "./rl";

export interface WalkForwardConfig {
  trainBars: number;
  testBars: number;
  anchored: boolean; // true=확장(앵커), false=롤링 고정창
}

export const DEFAULT_WF_CONFIG: WalkForwardConfig = {
  trainBars: 120,
  testBars: 10,
  anchored: false,
};

export interface WFFold {
  index: number;
  trainStartTime: string;
  trainEndTime: string;
  testStartTime: string;
  testEndTime: string;
  oosReturn: number;
  buyHoldReturn: number;
  trades: number;
  win: boolean;
}

export interface WFPoint {
  time: string;
  equity: number;
  buyHold: number;
}

export interface WalkForwardResult {
  folds: WFFold[];
  oosEquity: WFPoint[];
  aggregate: {
    totalOOSReturn: number;
    buyHoldReturn: number;
    alpha: number;
    avgFoldReturn: number;
    medianFoldReturn: number;
    winRate: number;
    totalFolds: number;
    sharpe: number;
    maxDrawdown: number;
    bestFold: number;
    worstFold: number;
  };
}

interface Engines {
  strategy: StrategyId;
  params?: StrategyParams;
  ml?: Partial<MLConfig>;
  rl?: Partial<RLConfig>;
}

function buildSignals(subBars: Bar[], testStart: number, eng: Engines) {
  const trainRatio = testStart / subBars.length;
  if (eng.strategy === "ml") {
    return runML(subBars, { ...eng.ml, trainRatio }).signals;
  }
  if (eng.strategy === "rl") {
    return runRL(subBars, { ...eng.rl, trainRatio }).signals;
  }
  return generateSignals(subBars, eng.strategy, eng.params ?? {});
}

export function walkForward(
  bars: Bar[],
  eng: Engines,
  btCfg: Partial<BacktestConfig>,
  wf: WalkForwardConfig
): WalkForwardResult {
  const n = bars.length;
  const initialCapital = btCfg.initialCapital ?? 10_000_000;
  const ppy = btCfg.periodsPerYear ?? 252;

  const folds: WFFold[] = [];
  const oosEquity: WFPoint[] = [];
  const oosReturns: number[] = []; // 봉별 OOS 수익률 (샤프/MDD용)

  let runningEquity = initialCapital;
  let runningBH = initialCapital;
  let peak = initialCapital;
  let maxDD = 0;

  let testStart = wf.trainBars;
  let foldIdx = 0;

  while (testStart + wf.testBars <= n) {
    const testEnd = testStart + wf.testBars;
    const trainStart = wf.anchored ? 0 : Math.max(0, testStart - wf.trainBars);
    const subBars = bars.slice(0, testEnd);

    const signals = buildSignals(subBars, testStart, eng);
    const res = runBacktest(subBars, signals, btCfg, testStart);
    if (res.equityCurve.length === 0) {
      testStart += wf.testBars;
      continue;
    }

    const foldStartEq = initialCapital;
    const foldStartBH = res.equityCurve[0].buyHold;
    let prevGlobal = runningEquity;

    for (const pt of res.equityCurve) {
      const stratNorm = pt.equity / foldStartEq;
      const bhNorm = foldStartBH > 0 ? pt.buyHold / foldStartBH : 1;
      const globalEq = runningEquity * stratNorm;
      const globalBH = runningBH * bhNorm;
      oosReturns.push(prevGlobal === 0 ? 0 : globalEq / prevGlobal - 1);
      prevGlobal = globalEq;
      peak = Math.max(peak, globalEq);
      maxDD = Math.min(maxDD, peak > 0 ? globalEq / peak - 1 : 0);
      oosEquity.push({ time: pt.time, equity: globalEq, buyHold: globalBH });
    }
    // 폴드 종료 후 러닝 자산 갱신
    const lastStratNorm = res.equityCurve[res.equityCurve.length - 1].equity / foldStartEq;
    const lastBHNorm = foldStartBH > 0 ? res.equityCurve[res.equityCurve.length - 1].buyHold / foldStartBH : 1;
    runningEquity *= lastStratNorm;
    runningBH *= lastBHNorm;

    folds.push({
      index: foldIdx,
      trainStartTime: bars[trainStart]?.time ?? "",
      trainEndTime: bars[testStart - 1]?.time ?? "",
      testStartTime: bars[testStart]?.time ?? "",
      testEndTime: bars[testEnd - 1]?.time ?? "",
      oosReturn: res.metrics.totalReturn,
      buyHoldReturn: res.metrics.buyHoldReturn,
      trades: res.trades.length,
      win: res.metrics.totalReturn > 0,
    });

    testStart += wf.testBars;
    foldIdx++;
  }

  const foldReturns = folds.map((f) => f.oosReturn);
  const sorted = [...foldReturns].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const avg = foldReturns.length ? foldReturns.reduce((a, b) => a + b, 0) / foldReturns.length : 0;
  const winRate = folds.length ? folds.filter((f) => f.win).length / folds.length : 0;

  const meanR = oosReturns.length ? oosReturns.reduce((a, b) => a + b, 0) / oosReturns.length : 0;
  const stdR = oosReturns.length
    ? Math.sqrt(oosReturns.reduce((a, b) => a + (b - meanR) ** 2, 0) / oosReturns.length)
    : 0;
  const sharpe = stdR === 0 ? 0 : (meanR / stdR) * Math.sqrt(ppy);

  const totalOOSReturn = runningEquity / initialCapital - 1;
  const buyHoldReturn = runningBH / initialCapital - 1;

  return {
    folds,
    oosEquity,
    aggregate: {
      totalOOSReturn,
      buyHoldReturn,
      alpha: totalOOSReturn - buyHoldReturn,
      avgFoldReturn: avg,
      medianFoldReturn: median,
      winRate,
      totalFolds: folds.length,
      sharpe,
      maxDrawdown: maxDD,
      bestFold: foldReturns.length ? Math.max(...foldReturns) : 0,
      worstFold: foldReturns.length ? Math.min(...foldReturns) : 0,
    },
  };
}
