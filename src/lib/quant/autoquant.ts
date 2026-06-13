// 오토퀀트: "전략을 고르지 않는다 — 모델이 스스로 고르고 앙상블한다"
// 후보 모델 라이브러리(규칙기반 + 신경망MLP + 강화학습Q)를 아웃오브샘플(검증구간)로 평가하고,
// 양(+)의 성과 모델만 선별해 다수결 앙상블로 최종 시그널을 만든다.
// 참고: Yang et al. (2020) "Deep RL for Automated Stock Trading: An Ensemble Strategy" (FinRL);
//       López de Prado, ensemble + PBO (과적합 통제).

import type { Bar, Position, StrategyId, StrategyParams, BacktestConfig } from "./types";
import { generateSignals } from "./strategies";
import { runBacktest } from "./backtest";
import { runML } from "./ml";
import { runRL } from "./rl";

interface Candidate {
  id: string;
  kind: "technical" | "ml" | "rl";
  strategy?: StrategyId;
  params?: StrategyParams;
}

const CANDIDATES: Candidate[] = [
  { id: "추세 EMA 20/60", kind: "technical", strategy: "ma_crossover", params: { fast: 20, slow: 60 } },
  { id: "추세 EMA 10/30", kind: "technical", strategy: "ma_crossover", params: { fast: 10, slow: 30 } },
  { id: "RSI 역추세", kind: "technical", strategy: "rsi_reversion", params: { rsiPeriod: 14, oversold: 30, overbought: 70 } },
  { id: "MACD 추세추종", kind: "technical", strategy: "macd", params: {} },
  { id: "볼린저 평균회귀", kind: "technical", strategy: "bollinger_reversion", params: { bbPeriod: 20, bbK: 2 } },
  { id: "돈키언 돌파", kind: "technical", strategy: "donchian_breakout", params: { channel: 20 } },
  { id: "신경망 (MLP·딥러닝)", kind: "ml" },
  { id: "강화학습 (Q-러닝)", kind: "rl" },
];

export interface AutoCandidateScore {
  id: string;
  kind: "technical" | "ml" | "rl";
  oosReturn: number;
  oosSharpe: number;
  trades: number;
  selected: boolean;
  currentSignal: Position;
}

export interface AutoQuantOutput {
  trainEndIndex: number;
  trainEndTime: string;
  candidates: AutoCandidateScore[];
  ensembleMembers: string[];
  ensembleSignals: Position[];
  agreement: number; // 현재 시점 롱 동의 비율
  selectedCount: number;
  lowConfidence: boolean;
}

function candidateSignals(bars: Bar[], c: Candidate, trainRatio: number): Position[] {
  if (c.kind === "ml") return runML(bars, { trainRatio }).signals;
  if (c.kind === "rl") return runRL(bars, { trainRatio }).signals;
  return generateSignals(bars, c.strategy!, c.params ?? {});
}

export function autoQuant(bars: Bar[], cfg: Partial<BacktestConfig>): AutoQuantOutput {
  const n = bars.length;
  const trainRatio = 0.7;
  const trainEndIndex = Math.floor(n * trainRatio);

  const allSignals: Position[][] = [];
  const scores: AutoCandidateScore[] = [];

  for (const c of CANDIDATES) {
    const signals = candidateSignals(bars, c, trainRatio);
    allSignals.push(signals);
    // 검증구간(아웃오브샘플)에서만 평가
    const res = runBacktest(bars, signals, cfg, trainEndIndex);
    scores.push({
      id: c.id,
      kind: c.kind,
      oosReturn: res.metrics.totalReturn,
      oosSharpe: res.metrics.sharpe,
      trades: res.trades.length,
      selected: false,
      currentSignal: signals[n - 1] ?? 0,
    });
  }

  // 선별: OOS 수익률>0 && 샤프>0. 샤프 내림차순 상위 최대 4개.
  const ranked = scores
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.oosReturn > 0 && s.oosSharpe > 0)
    .sort((a, b) => b.s.oosSharpe - a.s.oosSharpe);

  let lowConfidence = false;
  let chosen = ranked.slice(0, 4);
  if (chosen.length === 0) {
    // 양의 성과 모델이 없으면 가장 덜 나쁜 1개를 낮은 확신도로 채택
    const best = [...scores.map((s, i) => ({ s, i }))].sort((a, b) => b.s.oosSharpe - a.s.oosSharpe)[0];
    chosen = best ? [best] : [];
    lowConfidence = true;
  }

  const chosenIdx = new Set(chosen.map((c) => c.i));
  chosen.forEach((c) => (scores[c.i].selected = true));

  // 앙상블: 각 봉에서 선택모델의 다수결 (롱 득표 > 절반 → 롱)
  const ensembleSignals: Position[] = Array(n).fill(0);
  const k = chosenIdx.size;
  for (let bar = 0; bar < n; bar++) {
    let longVotes = 0;
    for (const idx of chosenIdx) if ((allSignals[idx][bar] ?? 0) === 1) longVotes++;
    ensembleSignals[bar] = k > 0 && longVotes > k / 2 ? 1 : 0;
  }

  // 현재 동의율
  let nowLong = 0;
  for (const idx of chosenIdx) if ((allSignals[idx][n - 1] ?? 0) === 1) nowLong++;
  const agreement = k > 0 ? nowLong / k : 0;

  return {
    trainEndIndex,
    trainEndTime: bars[trainEndIndex]?.time ?? "",
    candidates: scores.sort((a, b) => b.oosSharpe - a.oosSharpe),
    ensembleMembers: chosen.map((c) => CANDIDATES[c.i].id),
    ensembleSignals,
    agreement,
    selectedCount: k,
    lowConfidence,
  };
}
