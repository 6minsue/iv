// 머신러닝 기반 시그널 (순수 TypeScript)
// - 피처 엔지니어링 (룩어헤드 없음)
// - 로지스틱 회귀 / MLP(1-은닉층 신경망) 직접 구현 + 역전파
// - 워크포워드 학습/검증 분할로 아웃오브샘플 평가
// 참고: López de Prado, "Advances in Financial Machine Learning" (walk-forward, 라벨링 개념)

import type { Bar, Position } from "./types";
import { sma, rsi, macd, bollinger, stochastic, rollingStd, simpleReturns } from "./indicators";

export interface MLConfig {
  model: "logistic" | "mlp";
  horizon: number; // 예측 구간(봉 수)
  threshold: number; // 양성 라벨 기준 미래수익률
  probThreshold: number; // 롱 진입 확률 임계값
  trainRatio: number; // 학습 구간 비율
  epochs: number;
  learningRate: number;
  hiddenUnits: number;
  l2: number;
}

export const DEFAULT_ML_CONFIG: MLConfig = {
  model: "mlp",
  horizon: 5,
  threshold: 0,
  probThreshold: 0.55,
  trainRatio: 0.7,
  epochs: 400,
  learningRate: 0.08,
  hiddenUnits: 8,
  l2: 0.0008,
};

export const FEATURE_NAMES = [
  "수익률(1)",
  "수익률(5)",
  "수익률(10)",
  "RSI(14)",
  "MACD히스토",
  "SMA20이격",
  "볼린저%B",
  "거래량비",
  "변동성(20)",
  "스토캐스틱",
];

interface Sample {
  index: number; // bar index
  x: number[];
  y: number; // 0/1 (라벨, 미래수익률 기반)
  hasLabel: boolean;
}

function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

/** 시드 기반 난수 (mulberry32) */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 캔들 → 피처 행렬 (가능한 모든 봉) + 라벨 */
function buildSamples(bars: Bar[], horizon: number, threshold: number): Sample[] {
  const closes = bars.map((b) => b.close);
  const vols: (number | null)[] = bars.map((b) => b.volume);
  const ret = simpleReturns(closes);
  const sma20 = sma(closes, 20);
  const volSma20 = sma(vols, 20);
  const rsi14 = rsi(closes, 14);
  const macdHist = macd(closes).histogram;
  const bb = bollinger(closes, 20, 2);
  const stoch = stochastic(bars, 14, 3).k;
  const vol20 = rollingStd(ret as (number | null)[], 20);

  const samples: Sample[] = [];
  for (let i = 10; i < bars.length; i++) {
    const s20 = sma20[i];
    const vs20 = volSma20[i];
    const r14 = rsi14[i];
    const mh = macdHist[i];
    const pb = bb.percentB[i];
    const sk = stoch[i];
    const v20 = vol20[i];
    if (s20 == null || vs20 == null || r14 == null || mh == null || pb == null || sk == null || v20 == null)
      continue;

    const x = [
      closes[i] / closes[i - 1] - 1,
      closes[i] / closes[i - 5] - 1,
      closes[i] / closes[i - 10] - 1,
      (r14 - 50) / 50,
      mh / closes[i],
      (closes[i] - s20) / s20,
      pb - 0.5,
      vs20 === 0 ? 0 : Math.max(-1, Math.min(3, closes[i] && vols[i] != null ? (vols[i] as number) / vs20 - 1 : 0)),
      v20,
      sk / 100 - 0.5,
    ];

    const labelIdx = i + horizon;
    const hasLabel = labelIdx < bars.length;
    const y = hasLabel ? (closes[labelIdx] / closes[i] - 1 > threshold ? 1 : 0) : 0;
    samples.push({ index: i, x, y, hasLabel });
  }
  return samples;
}

function standardize(samples: Sample[], trainMask: boolean[]): { mean: number[]; std: number[] } {
  const F = samples[0]?.x.length ?? 0;
  const mean = Array(F).fill(0);
  const std = Array(F).fill(0);
  let count = 0;
  for (let s = 0; s < samples.length; s++) {
    if (!trainMask[s]) continue;
    count++;
    for (let j = 0; j < F; j++) mean[j] += samples[s].x[j];
  }
  if (count === 0) return { mean: Array(F).fill(0), std: Array(F).fill(1) };
  for (let j = 0; j < F; j++) mean[j] /= count;
  for (let s = 0; s < samples.length; s++) {
    if (!trainMask[s]) continue;
    for (let j = 0; j < F; j++) std[j] += (samples[s].x[j] - mean[j]) ** 2;
  }
  for (let j = 0; j < F; j++) std[j] = Math.sqrt(std[j] / count) || 1;
  return { mean, std };
}

interface TrainedModel {
  predict: (x: number[]) => number; // 확률
  importance?: number[];
}

function trainLogistic(X: number[][], Y: number[], cfg: MLConfig): TrainedModel {
  const F = X[0].length;
  const w = Array(F).fill(0);
  let b = 0;
  const N = X.length;
  for (let epoch = 0; epoch < cfg.epochs; epoch++) {
    const gw = Array(F).fill(0);
    let gb = 0;
    for (let n = 0; n < N; n++) {
      let z = b;
      for (let j = 0; j < F; j++) z += w[j] * X[n][j];
      const p = sigmoid(z);
      const dz = p - Y[n];
      for (let j = 0; j < F; j++) gw[j] += dz * X[n][j];
      gb += dz;
    }
    for (let j = 0; j < F; j++) w[j] -= cfg.learningRate * (gw[j] / N + cfg.l2 * w[j]);
    b -= cfg.learningRate * (gb / N);
  }
  return {
    predict: (x) => {
      let z = b;
      for (let j = 0; j < F; j++) z += w[j] * x[j];
      return sigmoid(z);
    },
    importance: w.map((v) => Math.abs(v)),
  };
}

function trainMLP(X: number[][], Y: number[], cfg: MLConfig): TrainedModel {
  const F = X[0].length;
  const H = cfg.hiddenUnits;
  const rand = mulberry32(42);
  const scale1 = Math.sqrt(1 / F);
  const scale2 = Math.sqrt(1 / H);
  const W1 = Array.from({ length: H }, () => Array.from({ length: F }, () => (rand() * 2 - 1) * scale1));
  const b1 = Array(H).fill(0);
  const W2 = Array.from({ length: H }, () => (rand() * 2 - 1) * scale2);
  let b2 = 0;
  const N = X.length;
  const lr = cfg.learningRate;

  for (let epoch = 0; epoch < cfg.epochs; epoch++) {
    const gW1 = Array.from({ length: H }, () => Array(F).fill(0));
    const gb1 = Array(H).fill(0);
    const gW2 = Array(H).fill(0);
    let gb2 = 0;

    for (let n = 0; n < N; n++) {
      const x = X[n];
      const hPre = Array(H).fill(0);
      const h = Array(H).fill(0);
      for (let k = 0; k < H; k++) {
        let z = b1[k];
        for (let j = 0; j < F; j++) z += W1[k][j] * x[j];
        hPre[k] = z;
        h[k] = Math.tanh(z);
      }
      let zOut = b2;
      for (let k = 0; k < H; k++) zOut += W2[k] * h[k];
      const p = sigmoid(zOut);
      const dz = p - Y[n];

      gb2 += dz;
      for (let k = 0; k < H; k++) {
        gW2[k] += dz * h[k];
        const dh = dz * W2[k];
        const dhPre = dh * (1 - h[k] * h[k]);
        gb1[k] += dhPre;
        for (let j = 0; j < F; j++) gW1[k][j] += dhPre * x[j];
      }
    }

    b2 -= lr * (gb2 / N);
    for (let k = 0; k < H; k++) {
      W2[k] -= lr * (gW2[k] / N + cfg.l2 * W2[k]);
      b1[k] -= lr * (gb1[k] / N);
      for (let j = 0; j < F; j++) W1[k][j] -= lr * (gW1[k][j] / N + cfg.l2 * W1[k][j]);
    }
  }

  return {
    predict: (x) => {
      const h = Array(H).fill(0);
      for (let k = 0; k < H; k++) {
        let z = b1[k];
        for (let j = 0; j < F; j++) z += W1[k][j] * x[j];
        h[k] = Math.tanh(z);
      }
      let zOut = b2;
      for (let k = 0; k < H; k++) zOut += W2[k] * h[k];
      return sigmoid(zOut);
    },
  };
}

export interface MLResult {
  signals: Position[]; // bars 길이, 테스트 구간만 1/0
  probabilities: (number | null)[]; // bars 길이
  trainEndIndex: number; // 이 인덱스 이후가 아웃오브샘플
  featureNames: string[];
  importance: number[] | null;
  metrics: {
    trainAccuracy: number;
    testAccuracy: number;
    baseline: number; // 테스트 구간 양성 비율 (always-long 정확도)
    trainSamples: number;
    testSamples: number;
    positiveRate: number;
  };
}

export function runML(bars: Bar[], userCfg: Partial<MLConfig> = {}): MLResult {
  const cfg = { ...DEFAULT_ML_CONFIG, ...userCfg };
  const n = bars.length;
  const samples = buildSamples(bars, cfg.horizon, cfg.threshold);

  const empty: MLResult = {
    signals: Array(n).fill(0),
    probabilities: Array(n).fill(null),
    trainEndIndex: Math.floor(n * cfg.trainRatio),
    featureNames: FEATURE_NAMES,
    importance: null,
    metrics: { trainAccuracy: 0, testAccuracy: 0, baseline: 0, trainSamples: 0, testSamples: 0, positiveRate: 0 },
  };
  if (samples.length < 40) return empty;

  const trainEndIndex = Math.floor(n * cfg.trainRatio);

  // 학습 표본: 라벨이 학습구간 내에 완결되는 것만 (누수 방지)
  const trainMask = samples.map((s) => s.hasLabel && s.index + cfg.horizon <= trainEndIndex);
  const { mean, std } = standardize(samples, trainMask);

  const norm = (x: number[]) => x.map((v, j) => (v - mean[j]) / std[j]);

  const Xtr: number[][] = [];
  const Ytr: number[] = [];
  for (let s = 0; s < samples.length; s++) {
    if (!trainMask[s]) continue;
    Xtr.push(norm(samples[s].x));
    Ytr.push(samples[s].y);
  }
  if (Xtr.length < 20) return empty;

  const model = cfg.model === "logistic" ? trainLogistic(Xtr, Ytr, cfg) : trainMLP(Xtr, Ytr, cfg);

  const probabilities: (number | null)[] = Array(n).fill(null);
  const signals: Position[] = Array(n).fill(0);

  let trainCorrect = 0;
  let trainTotal = 0;
  let testCorrect = 0;
  let testTotal = 0;
  let testPositives = 0;
  let allPositives = 0;
  let allLabeled = 0;

  for (let s = 0; s < samples.length; s++) {
    const smp = samples[s];
    const p = model.predict(norm(smp.x));
    probabilities[smp.index] = p;
    const pred = p > 0.5 ? 1 : 0;

    if (smp.hasLabel) {
      allLabeled++;
      if (smp.y === 1) allPositives++;
    }

    if (trainMask[s]) {
      trainTotal++;
      if (pred === smp.y) trainCorrect++;
    } else if (smp.index > trainEndIndex) {
      // 아웃오브샘플 시그널
      signals[smp.index] = p > cfg.probThreshold ? 1 : 0;
      if (smp.hasLabel) {
        testTotal++;
        if (pred === smp.y) testCorrect++;
        if (smp.y === 1) testPositives++;
      }
    }
  }

  return {
    signals,
    probabilities,
    trainEndIndex,
    featureNames: FEATURE_NAMES,
    importance: model.importance ?? null,
    metrics: {
      trainAccuracy: trainTotal ? trainCorrect / trainTotal : 0,
      testAccuracy: testTotal ? testCorrect / testTotal : 0,
      baseline: testTotal ? testPositives / testTotal : 0,
      trainSamples: trainTotal,
      testSamples: testTotal,
      positiveRate: allLabeled ? allPositives / allLabeled : 0,
    },
  };
}
