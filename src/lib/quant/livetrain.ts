// 클라이언트 실시간 학습 엔진 (브라우저에서 epoch 단위로 학습 → 손실곡선 실시간 시각화)
// 순수 TS, 서버 의존성 없음. indicators만 사용.

import type { Bar } from "./types";
import { sma, rsi, macd, bollinger, stochastic, rollingStd, simpleReturns } from "./indicators";

export const LIVE_FEATURES = [
  "수익률(1)", "수익률(5)", "수익률(10)", "RSI(14)", "MACD히스토",
  "SMA20이격", "볼린저%B", "거래량비", "변동성(20)", "스토캐스틱",
];

export interface SplitData {
  Xtr: number[][]; Ytr: number[];
  Xte: number[][]; Yte: number[];
  featureNames: string[];
  trainEnd: number;
  posRate: number; // 검증셋 양성비율 (always-long 기준선)
}

/** 캔들 → 표준화된 학습/검증 분할 */
export function buildSplit(bars: Bar[], horizon = 5, threshold = 0, trainRatio = 0.7): SplitData | null {
  const closes = bars.map((b) => b.close);
  const vols = bars.map((b) => b.volume);
  const ret = simpleReturns(closes);
  const sma20 = sma(closes, 20);
  const volSma20 = sma(vols, 20);
  const rsi14 = rsi(closes, 14);
  const macdHist = macd(closes).histogram;
  const bb = bollinger(closes, 20, 2);
  const stoch = stochastic(bars, 14, 3).k;
  const vol20 = rollingStd(ret as (number | null)[], 20);

  const rows: { idx: number; x: number[]; y: number }[] = [];
  for (let i = 10; i < bars.length; i++) {
    const s20 = sma20[i], vs20 = volSma20[i], r14 = rsi14[i], mh = macdHist[i], pb = bb.percentB[i], sk = stoch[i], v20 = vol20[i];
    if (s20 == null || vs20 == null || r14 == null || mh == null || pb == null || sk == null || v20 == null) continue;
    const labelIdx = i + horizon;
    if (labelIdx >= bars.length) continue;
    const x = [
      closes[i] / closes[i - 1] - 1,
      closes[i] / closes[i - 5] - 1,
      closes[i] / closes[i - 10] - 1,
      ((r14 as number) - 50) / 50,
      (mh as number) / closes[i],
      (closes[i] - (s20 as number)) / (s20 as number),
      (pb as number) - 0.5,
      vs20 === 0 ? 0 : Math.max(-1, Math.min(3, vols[i] / (vs20 as number) - 1)),
      v20 as number,
      (sk as number) / 100 - 0.5,
    ];
    const y = closes[labelIdx] / closes[i] - 1 > threshold ? 1 : 0;
    rows.push({ idx: i, x, y });
  }
  if (rows.length < 40) return null;

  const splitAt = Math.floor(rows.length * trainRatio);
  const trainRows = rows.slice(0, splitAt);
  const testRows = rows.slice(splitAt);

  // 표준화 (train 기준)
  const F = rows[0].x.length;
  const mean = Array(F).fill(0), std = Array(F).fill(0);
  for (const r of trainRows) for (let j = 0; j < F; j++) mean[j] += r.x[j];
  for (let j = 0; j < F; j++) mean[j] /= trainRows.length;
  for (const r of trainRows) for (let j = 0; j < F; j++) std[j] += (r.x[j] - mean[j]) ** 2;
  for (let j = 0; j < F; j++) std[j] = Math.sqrt(std[j] / trainRows.length) || 1;
  const norm = (x: number[]) => x.map((v, j) => (v - mean[j]) / std[j]);

  const Yte = testRows.map((r) => r.y);
  return {
    Xtr: trainRows.map((r) => norm(r.x)),
    Ytr: trainRows.map((r) => r.y),
    Xte: testRows.map((r) => norm(r.x)),
    Yte,
    featureNames: LIVE_FEATURES,
    trainEnd: rows[splitAt]?.idx ?? bars.length,
    posRate: Yte.length ? Yte.reduce((a, b) => a + b, 0) / Yte.length : 0,
  };
}

/** 시퀀스 학습용 분할 (GRU 등 순환신경망). 각 표본 = seqLen개 피처벡터. */
export interface SeqSplit {
  Xtr: number[][][]; Ytr: number[];
  Xte: number[][][]; Yte: number[];
  trainEnd: number; posRate: number; seqLen: number;
}

function featureAt(bars: Bar[]): (number[] | null)[] {
  const closes = bars.map((b) => b.close);
  const vols = bars.map((b) => b.volume);
  const ret = simpleReturns(closes);
  const sma20 = sma(closes, 20);
  const volSma20 = sma(vols, 20);
  const rsi14 = rsi(closes, 14);
  const macdHist = macd(closes).histogram;
  const bb = bollinger(closes, 20, 2);
  const stoch = stochastic(bars, 14, 3).k;
  const vol20 = rollingStd(ret as (number | null)[], 20);
  const out: (number[] | null)[] = Array(bars.length).fill(null);
  for (let i = 10; i < bars.length; i++) {
    const s20 = sma20[i], vs20 = volSma20[i], r14 = rsi14[i], mh = macdHist[i], pb = bb.percentB[i], sk = stoch[i], v20 = vol20[i];
    if (s20 == null || vs20 == null || r14 == null || mh == null || pb == null || sk == null || v20 == null) continue;
    out[i] = [
      closes[i] / closes[i - 1] - 1,
      closes[i] / closes[i - 5] - 1,
      closes[i] / closes[i - 10] - 1,
      ((r14 as number) - 50) / 50,
      (mh as number) / closes[i],
      (closes[i] - (s20 as number)) / (s20 as number),
      (pb as number) - 0.5,
      vs20 === 0 ? 0 : Math.max(-1, Math.min(3, vols[i] / (vs20 as number) - 1)),
      v20 as number,
      (sk as number) / 100 - 0.5,
    ];
  }
  return out;
}

export function buildSequenceSplit(bars: Bar[], seqLen = 6, horizon = 5, threshold = 0, trainRatio = 0.7): SeqSplit | null {
  const closes = bars.map((b) => b.close);
  const feat = featureAt(bars);
  let warmup = 0;
  while (warmup < feat.length && feat[warmup] == null) warmup++;
  const samples: { seq: number[][]; y: number }[] = [];
  for (let i = warmup + seqLen - 1; i < bars.length; i++) {
    if (i + horizon >= bars.length) break;
    let ok = true;
    const seq: number[][] = [];
    for (let t = i - seqLen + 1; t <= i; t++) {
      if (feat[t] == null) { ok = false; break; }
      seq.push(feat[t] as number[]);
    }
    if (!ok) continue;
    samples.push({ seq, y: closes[i + horizon] / closes[i] - 1 > threshold ? 1 : 0 });
  }
  if (samples.length < 40) return null;

  const splitAt = Math.floor(samples.length * trainRatio);
  const F = samples[0].seq[0].length;
  // 표준화 (train 구간 전체 타임스텝 기준)
  const mean = Array(F).fill(0), std = Array(F).fill(0);
  let cnt = 0;
  for (let s = 0; s < splitAt; s++) for (const v of samples[s].seq) { for (let j = 0; j < F; j++) mean[j] += v[j]; cnt++; }
  for (let j = 0; j < F; j++) mean[j] /= cnt;
  for (let s = 0; s < splitAt; s++) for (const v of samples[s].seq) for (let j = 0; j < F; j++) std[j] += (v[j] - mean[j]) ** 2;
  for (let j = 0; j < F; j++) std[j] = Math.sqrt(std[j] / cnt) || 1;
  const normSeq = (seq: number[][]) => seq.map((v) => v.map((x, j) => (x - mean[j]) / std[j]));

  const Yte = samples.slice(splitAt).map((s) => s.y);
  return {
    Xtr: samples.slice(0, splitAt).map((s) => normSeq(s.seq)),
    Ytr: samples.slice(0, splitAt).map((s) => s.y),
    Xte: samples.slice(splitAt).map((s) => normSeq(s.seq)),
    Yte,
    trainEnd: bars.length,
    posRate: Yte.length ? Yte.reduce((a, b) => a + b, 0) / Yte.length : 0,
    seqLen,
  };
}

function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TrainStep { loss: number; trainAcc: number; testAcc: number; }

/** 신경망 (은닉층 H, H=0이면 로지스틱 회귀) — epoch 단위 학습 */
export class NeuralModel {
  private W1: number[][]; private b1: number[];
  private W2: number[]; private b2 = 0;
  private F: number; private H: number; private lr: number; private l2: number;

  constructor(F: number, H: number, lr = 0.1, l2 = 0.0005, seed = 42) {
    this.F = F; this.H = H; this.lr = lr; this.l2 = l2;
    const rand = mulberry32(seed);
    const s1 = Math.sqrt(1 / Math.max(F, 1));
    const s2 = Math.sqrt(1 / Math.max(H, 1));
    this.W1 = Array.from({ length: H }, () => Array.from({ length: F }, () => (rand() * 2 - 1) * s1));
    this.b1 = Array(H).fill(0);
    // H=0 → 로지스틱: W2를 입력차원 F로 사용
    this.W2 = H > 0 ? Array.from({ length: H }, () => (rand() * 2 - 1) * s2) : Array.from({ length: F }, () => (rand() * 2 - 1) * s1);
  }

  private forward(x: number[]): { p: number; h: number[] } {
    if (this.H === 0) {
      let z = this.b2;
      for (let j = 0; j < this.F; j++) z += this.W2[j] * x[j];
      return { p: sigmoid(z), h: [] };
    }
    const h = Array(this.H).fill(0);
    for (let k = 0; k < this.H; k++) {
      let z = this.b1[k];
      for (let j = 0; j < this.F; j++) z += this.W1[k][j] * x[j];
      h[k] = Math.tanh(z);
    }
    let zo = this.b2;
    for (let k = 0; k < this.H; k++) zo += this.W2[k] * h[k];
    return { p: sigmoid(zo), h };
  }

  predictProba(x: number[]): number { return this.forward(x).p; }

  accuracy(X: number[][], Y: number[]): number {
    if (!X.length) return 0;
    let ok = 0;
    for (let n = 0; n < X.length; n++) if ((this.forward(X[n]).p > 0.5 ? 1 : 0) === Y[n]) ok++;
    return ok / X.length;
  }

  /** 한 epoch 학습 (full-batch GD), 반환: 손실/정확도 */
  trainEpoch(Xtr: number[][], Ytr: number[], Xte: number[][], Yte: number[]): TrainStep {
    const N = Xtr.length;
    let loss = 0;
    if (this.H === 0) {
      const gW = Array(this.F).fill(0); let gb = 0;
      for (let n = 0; n < N; n++) {
        const { p } = this.forward(Xtr[n]);
        const y = Ytr[n];
        loss += -(y * Math.log(p + 1e-9) + (1 - y) * Math.log(1 - p + 1e-9));
        const dz = p - y;
        for (let j = 0; j < this.F; j++) gW[j] += dz * Xtr[n][j];
        gb += dz;
      }
      for (let j = 0; j < this.F; j++) this.W2[j] -= this.lr * (gW[j] / N + this.l2 * this.W2[j]);
      this.b2 -= this.lr * (gb / N);
    } else {
      const gW1 = Array.from({ length: this.H }, () => Array(this.F).fill(0));
      const gb1 = Array(this.H).fill(0);
      const gW2 = Array(this.H).fill(0); let gb2 = 0;
      for (let n = 0; n < N; n++) {
        const x = Xtr[n];
        const { p, h } = this.forward(x);
        const y = Ytr[n];
        loss += -(y * Math.log(p + 1e-9) + (1 - y) * Math.log(1 - p + 1e-9));
        const dz = p - y;
        gb2 += dz;
        for (let k = 0; k < this.H; k++) {
          gW2[k] += dz * h[k];
          const dh = dz * this.W2[k] * (1 - h[k] * h[k]);
          gb1[k] += dh;
          for (let j = 0; j < this.F; j++) gW1[k][j] += dh * x[j];
        }
      }
      this.b2 -= this.lr * (gb2 / N);
      for (let k = 0; k < this.H; k++) {
        this.W2[k] -= this.lr * (gW2[k] / N + this.l2 * this.W2[k]);
        this.b1[k] -= this.lr * (gb1[k] / N);
        for (let j = 0; j < this.F; j++) this.W1[k][j] -= this.lr * (gW1[k][j] / N + this.l2 * this.W1[k][j]);
      }
    }
    return { loss: loss / N, trainAcc: this.accuracy(Xtr, Ytr), testAcc: this.accuracy(Xte, Yte) };
  }
}

function zeros2(r: number, c: number): number[][] { return Array.from({ length: r }, () => Array(c).fill(0)); }

/** GRU 순환신경망 (시계열 딥러닝) — BPTT, epoch 단위 학습. 검증 완료된 구현. */
export class GRUModel {
  private Wz: number[][]; private Wr: number[][]; private Wh: number[][];
  private Uz: number[][]; private Ur: number[][]; private Uh: number[][];
  private bz: number[]; private br: number[]; private bh: number[];
  private Wo: number[]; private bo = 0;
  private F: number; private H: number; private lr: number;

  constructor(F: number, H: number, lr = 0.25, seed = 42) {
    this.F = F; this.H = H; this.lr = lr;
    const rand = mulberry32(seed);
    const s = Math.sqrt(1 / Math.max(F, 1)), sh = Math.sqrt(1 / Math.max(H, 1));
    const mk = (rows: number, cols: number, sc: number) => Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rand() * 2 - 1) * sc));
    this.Wz = mk(H, F, s); this.Wr = mk(H, F, s); this.Wh = mk(H, F, s);
    this.Uz = mk(H, H, sh); this.Ur = mk(H, H, sh); this.Uh = mk(H, H, sh);
    this.bz = Array(H).fill(0); this.br = Array(H).fill(0); this.bh = Array(H).fill(0);
    this.Wo = Array.from({ length: H }, () => (rand() * 2 - 1) * sh);
  }

  private forward(seq: number[][]) {
    const H = this.H, F = this.F;
    let hprev = Array(H).fill(0);
    const cache: { x: number[]; hprev: number[]; z: number[]; r: number[]; n: number[]; uh: number[] }[] = [];
    for (const x of seq) {
      const z = Array(H), r = Array(H), n = Array(H), uh = Array(H), h = Array(H);
      for (let i = 0; i < H; i++) {
        let zi = this.bz[i], ri = this.br[i];
        for (let j = 0; j < F; j++) { zi += this.Wz[i][j] * x[j]; ri += this.Wr[i][j] * x[j]; }
        for (let k = 0; k < H; k++) { zi += this.Uz[i][k] * hprev[k]; ri += this.Ur[i][k] * hprev[k]; }
        z[i] = sigmoid(zi); r[i] = sigmoid(ri);
      }
      for (let i = 0; i < H; i++) {
        let u = 0; for (let k = 0; k < H; k++) u += this.Uh[i][k] * hprev[k];
        uh[i] = u;
        let ni = this.bh[i]; for (let j = 0; j < F; j++) ni += this.Wh[i][j] * x[j];
        ni += r[i] * u; n[i] = Math.tanh(ni);
        h[i] = (1 - z[i]) * n[i] + z[i] * hprev[i];
      }
      cache.push({ x, hprev, z, r, n, uh });
      hprev = h;
    }
    let o = this.bo; for (let i = 0; i < H; i++) o += this.Wo[i] * hprev[i];
    return { p: sigmoid(o), hT: hprev, cache };
  }

  predictProba(seq: number[][]): number { return this.forward(seq).p; }

  accuracy(X: number[][][], Y: number[]): number {
    if (!X.length) return 0;
    let ok = 0;
    for (let s = 0; s < X.length; s++) if ((this.forward(X[s]).p > 0.5 ? 1 : 0) === Y[s]) ok++;
    return ok / X.length;
  }

  trainEpoch(Xtr: number[][][], Ytr: number[], Xte: number[][][], Yte: number[]): TrainStep {
    const H = this.H, F = this.F, N = Xtr.length, lr = this.lr;
    const gWz = zeros2(H, F), gWr = zeros2(H, F), gWh = zeros2(H, F);
    const gUz = zeros2(H, H), gUr = zeros2(H, H), gUh = zeros2(H, H);
    const gbz = Array(H).fill(0), gbr = Array(H).fill(0), gbh = Array(H).fill(0), gWo = Array(H).fill(0);
    let gbo = 0, loss = 0;
    for (let s = 0; s < N; s++) {
      const { p, hT, cache } = this.forward(Xtr[s]); const y = Ytr[s];
      loss += -(y * Math.log(p + 1e-9) + (1 - y) * Math.log(1 - p + 1e-9));
      const dopre = p - y; gbo += dopre;
      let dh = Array(H);
      for (let i = 0; i < H; i++) { gWo[i] += dopre * hT[i]; dh[i] = dopre * this.Wo[i]; }
      for (let t = cache.length - 1; t >= 0; t--) {
        const c = cache[t]; const dhprev = Array(H).fill(0);
        for (let i = 0; i < H; i++) {
          const dz = dh[i] * (c.hprev[i] - c.n[i]);
          const dn = dh[i] * (1 - c.z[i]);
          dhprev[i] += dh[i] * c.z[i];
          const dnin = dn * (1 - c.n[i] * c.n[i]);
          gbh[i] += dnin; for (let j = 0; j < F; j++) gWh[i][j] += dnin * c.x[j];
          const dr = dnin * c.uh[i];
          const duh = dnin * c.r[i];
          for (let k = 0; k < H; k++) { gUh[i][k] += duh * c.hprev[k]; dhprev[k] += duh * this.Uh[i][k]; }
          const dzin = dz * c.z[i] * (1 - c.z[i]);
          gbz[i] += dzin; for (let j = 0; j < F; j++) gWz[i][j] += dzin * c.x[j];
          for (let k = 0; k < H; k++) dhprev[k] += dzin * this.Uz[i][k];
          const drin = dr * c.r[i] * (1 - c.r[i]);
          gbr[i] += drin; for (let j = 0; j < F; j++) gWr[i][j] += drin * c.x[j];
          for (let k = 0; k < H; k++) dhprev[k] += drin * this.Ur[i][k];
        }
        dh = dhprev;
      }
    }
    const u2 = (W: number[][], g: number[][]) => { for (let i = 0; i < W.length; i++) for (let j = 0; j < W[i].length; j++) W[i][j] -= lr * g[i][j] / N; };
    const u1 = (b: number[], g: number[]) => { for (let i = 0; i < b.length; i++) b[i] -= lr * g[i] / N; };
    u2(this.Wz, gWz); u2(this.Wr, gWr); u2(this.Wh, gWh); u2(this.Uz, gUz); u2(this.Ur, gUr); u2(this.Uh, gUh);
    u1(this.bz, gbz); u1(this.br, gbr); u1(this.bh, gbh); u1(this.Wo, gWo); this.bo -= lr * gbo / N;
    return { loss: loss / N, trainAcc: this.accuracy(Xtr, Ytr), testAcc: this.accuracy(Xte, Yte) };
  }
}
