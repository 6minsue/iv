// 강화학습 트레이딩 에이전트 (Tabular Q-Learning)
// 참고: FinRL 계열 deep RL 트레이딩 연구의 경량화 버전 — 제한 데이터에서 안정적으로 수렴하는
//       이산 상태 Q-러닝. 상태=기술적 국면 이산화, 행동=목표포지션, 보상=비용차감 수익률.

import type { Bar, Position } from "./types";
import { sma, rsi, macd } from "./indicators";

export interface RLConfig {
  episodes: number;
  alpha: number; // 학습률
  gamma: number; // 할인율
  epsilon: number; // 초기 탐험율
  epsilonDecay: number;
  trainRatio: number;
  cost: number; // 포지션 변경 비용(수수료+슬리피지)
  allowShort: boolean;
  seed: number;
}

export const DEFAULT_RL_CONFIG: RLConfig = {
  episodes: 300,
  alpha: 0.1,
  gamma: 0.95,
  epsilon: 1.0,
  epsilonDecay: 0.99,
  trainRatio: 0.7,
  cost: 0.0015,
  allowShort: false,
  seed: 7,
};

export interface RLResult {
  signals: Position[];
  trainEndIndex: number;
  metrics: {
    episodes: number;
    finalEpsilon: number;
    avgRewardLast: number; // 마지막 에피소드 평균 보상
    visitedStates: number;
    convergence: number[]; // 에피소드별 누적보상 (학습곡선)
  };
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 봉별 기술적 국면을 정수 상태로 이산화 (포지션 제외) */
function featureStates(bars: Bar[]): { states: number[]; warmup: number; nFeatureStates: number } {
  const closes = bars.map((b) => b.close);
  const sma20 = sma(closes, 20);
  const r = rsi(closes, 14);
  const m = macd(closes);
  const states: number[] = Array(bars.length).fill(-1);
  let warmup = bars.length;
  for (let i = 0; i < bars.length; i++) {
    const s20 = sma20[i];
    const rv = r[i];
    const mh = m.histogram[i];
    if (s20 == null || rv == null || mh == null || i < 5) continue;
    if (i < warmup) warmup = i;
    const trend = closes[i] > (s20 as number) ? 1 : 0; // 2
    const rsiB = (rv as number) < 35 ? 0 : (rv as number) > 65 ? 2 : 1; // 3
    const mom = closes[i] / closes[i - 5] - 1 > 0 ? 1 : 0; // 2
    const macdB = (mh as number) > 0 ? 1 : 0; // 2
    states[i] = trend * 12 + rsiB * 4 + mom * 2 + macdB; // 0..23
  }
  return { states, warmup, nFeatureStates: 24 };
}

export function runRL(bars: Bar[], userCfg: Partial<RLConfig> = {}): RLResult {
  const cfg = { ...DEFAULT_RL_CONFIG, ...userCfg };
  const n = bars.length;
  const closes = bars.map((b) => b.close);
  const ret: number[] = Array(n).fill(0);
  for (let i = 1; i < n; i++) ret[i] = closes[i - 1] === 0 ? 0 : closes[i] / closes[i - 1] - 1;

  const { states, warmup, nFeatureStates } = featureStates(bars);
  const trainEndIndex = Math.floor(n * cfg.trainRatio);

  const positions: Position[] = cfg.allowShort ? [-1, 0, 1] : [0, 1];
  const nActions = positions.length;
  const posIndex = (p: Position) => positions.indexOf(p);
  const nStates = nFeatureStates * positions.length;
  const stateKey = (fs: number, pos: Position) => fs * positions.length + posIndex(pos);

  // Q 테이블 초기화
  const Q: number[][] = Array.from({ length: nStates }, () => Array(nActions).fill(0));
  const visited = new Set<number>();
  const rand = mulberry32(cfg.seed);

  let eps = cfg.epsilon;
  const convergence: number[] = [];
  let lastAvgReward = 0;

  const trainStart = Math.max(warmup, 1);

  for (let ep = 0; ep < cfg.episodes; ep++) {
    let position: Position = 0;
    let cumReward = 0;
    let steps = 0;
    for (let i = trainStart; i < trainEndIndex - 1; i++) {
      if (states[i] < 0 || states[i + 1] < 0) continue;
      const s = stateKey(states[i], position);
      visited.add(s);
      // ε-탐욕
      let a: number;
      if (rand() < eps) {
        a = Math.floor(rand() * nActions);
      } else {
        a = 0;
        for (let k = 1; k < nActions; k++) if (Q[s][k] > Q[s][a]) a = k;
      }
      const targetPos = positions[a];
      const reward = targetPos * ret[i + 1] - cfg.cost * Math.abs(targetPos - position);
      const s2 = stateKey(states[i + 1], targetPos);
      const maxNext = Math.max(...Q[s2]);
      Q[s][a] += cfg.alpha * (reward + cfg.gamma * maxNext - Q[s][a]);
      position = targetPos;
      cumReward += reward;
      steps++;
    }
    eps = Math.max(0.02, eps * cfg.epsilonDecay);
    convergence.push(cumReward);
    if (ep === cfg.episodes - 1) lastAvgReward = steps ? cumReward / steps : 0;
  }

  // 그리디 정책 롤아웃 → 전체 봉 시그널
  const signals: Position[] = Array(n).fill(0);
  let position: Position = 0;
  for (let i = trainStart; i < n; i++) {
    if (states[i] < 0) {
      signals[i] = position;
      continue;
    }
    const s = stateKey(states[i], position);
    let a = 0;
    for (let k = 1; k < nActions; k++) if (Q[s][k] > Q[s][a]) a = k;
    position = positions[a];
    signals[i] = position;
  }

  return {
    signals,
    trainEndIndex,
    metrics: {
      episodes: cfg.episodes,
      finalEpsilon: eps,
      avgRewardLast: lastAvgReward,
      visitedStates: visited.size,
      convergence,
    },
  };
}
