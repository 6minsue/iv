// 기술적 지표 라이브러리 (순수 함수, 룩어헤드 없음)
// 모든 함수는 입력과 같은 길이의 배열을 반환하며, 계산 불가 구간은 null.

import type { Bar } from "./types";

type Num = number | null;

/** 단순 이동평균 */
export function sma(values: Num[], period: number): Num[] {
  const out: Num[] = Array(values.length).fill(null);
  const buf: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      buf.length = 0;
      sum = 0;
      continue;
    }
    buf.push(v);
    sum += v;
    if (buf.length > period) sum -= buf.shift() as number;
    if (buf.length === period) out[i] = sum / period;
  }
  return out;
}

/** 지수 이동평균 (선행 null 허용; period개 유효값의 SMA로 시드) */
export function ema(values: Num[], period: number): Num[] {
  const out: Num[] = Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seedSum = 0;
  let seedCount = 0;
  let started = false;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (!started) {
      seedSum += v;
      seedCount++;
      if (seedCount === period) {
        prev = seedSum / period;
        out[i] = prev;
        started = true;
      }
    } else {
      prev = v * k + (prev as number) * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

/** 윈도우 표준편차(모집단) */
export function rollingStd(values: Num[], period: number): Num[] {
  const out: Num[] = Array(values.length).fill(null);
  const buf: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      buf.length = 0;
      continue;
    }
    buf.push(v);
    if (buf.length > period) buf.shift();
    if (buf.length === period) {
      const mean = buf.reduce((a, b) => a + b, 0) / period;
      const variance = buf.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
      out[i] = Math.sqrt(variance);
    }
  }
  return out;
}

/** RSI (Wilder 평활) */
export function rsi(closes: number[], period = 14): Num[] {
  const out: Num[] = Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d >= 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface MacdResult {
  macd: Num[];
  signal: Num[];
  histogram: Num[];
}

/** MACD */
export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine: Num[] = closes.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? (emaFast[i] as number) - (emaSlow[i] as number) : null
  );
  const signal = ema(macdLine, signalPeriod);
  const histogram: Num[] = closes.map((_, i) =>
    macdLine[i] != null && signal[i] != null ? (macdLine[i] as number) - (signal[i] as number) : null
  );
  return { macd: macdLine, signal, histogram };
}

export interface BollingerResult {
  middle: Num[];
  upper: Num[];
  lower: Num[];
  /** %B = (price - lower) / (upper - lower) */
  percentB: Num[];
  /** bandwidth = (upper - lower) / middle */
  bandwidth: Num[];
}

/** 볼린저 밴드 */
export function bollinger(closes: number[], period = 20, k = 2): BollingerResult {
  const middle = sma(closes, period);
  const std = rollingStd(closes, period);
  const upper: Num[] = [];
  const lower: Num[] = [];
  const percentB: Num[] = [];
  const bandwidth: Num[] = [];
  for (let i = 0; i < closes.length; i++) {
    const m = middle[i];
    const s = std[i];
    if (m == null || s == null) {
      upper[i] = lower[i] = percentB[i] = bandwidth[i] = null;
      continue;
    }
    const u = m + k * s;
    const l = m - k * s;
    upper[i] = u;
    lower[i] = l;
    percentB[i] = u === l ? 0.5 : (closes[i] - l) / (u - l);
    bandwidth[i] = m === 0 ? null : (u - l) / m;
  }
  return { middle, upper, lower, percentB, bandwidth };
}

export interface StochResult {
  k: Num[];
  d: Num[];
}

/** 스토캐스틱 */
export function stochastic(bars: Bar[], kPeriod = 14, dPeriod = 3): StochResult {
  const kArr: Num[] = Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    if (i < kPeriod - 1) continue;
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hh = Math.max(hh, bars[j].high);
      ll = Math.min(ll, bars[j].low);
    }
    kArr[i] = hh === ll ? 50 : (100 * (bars[i].close - ll)) / (hh - ll);
  }
  const d = sma(kArr, dPeriod);
  return { k: kArr, d };
}

/** True Range 배열 */
function trueRange(bars: Bar[]): number[] {
  return bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
}

/** ATR (Wilder 평활) */
export function atr(bars: Bar[], period = 14): Num[] {
  const tr = trueRange(bars);
  const out: Num[] = Array(bars.length).fill(null);
  if (bars.length < period + 1) return out;
  let prev = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = prev;
  for (let i = period + 1; i < bars.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export interface AdxResult {
  adx: Num[];
  plusDI: Num[];
  minusDI: Num[];
}

/** ADX / +DI / -DI (Wilder) */
export function adx(bars: Bar[], period = 14): AdxResult {
  const n = bars.length;
  const plusDM: number[] = Array(n).fill(0);
  const minusDM: number[] = Array(n).fill(0);
  const tr = trueRange(bars);
  for (let i = 1; i < n; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
  }
  const plusDI: Num[] = Array(n).fill(null);
  const minusDI: Num[] = Array(n).fill(null);
  const adxArr: Num[] = Array(n).fill(null);
  if (n < period * 2) return { adx: adxArr, plusDI, minusDI };

  let smTR = tr.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let smPlus = plusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let smMinus = minusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);

  const dx: Num[] = Array(n).fill(null);
  for (let i = period; i < n; i++) {
    if (i > period) {
      smTR = smTR - smTR / period + tr[i];
      smPlus = smPlus - smPlus / period + plusDM[i];
      smMinus = smMinus - smMinus / period + minusDM[i];
    }
    const pDI = smTR === 0 ? 0 : (100 * smPlus) / smTR;
    const mDI = smTR === 0 ? 0 : (100 * smMinus) / smTR;
    plusDI[i] = pDI;
    minusDI[i] = mDI;
    dx[i] = pDI + mDI === 0 ? 0 : (100 * Math.abs(pDI - mDI)) / (pDI + mDI);
  }

  // ADX = DX의 Wilder 평활
  const dxStart = period;
  let adxSeedSum = 0;
  let seeded = false;
  let prevAdx = 0;
  for (let i = dxStart; i < n; i++) {
    const cur = dx[i];
    if (cur == null) continue;
    if (!seeded) {
      adxSeedSum += cur;
      if (i - dxStart + 1 === period) {
        prevAdx = adxSeedSum / period;
        adxArr[i] = prevAdx;
        seeded = true;
      }
    } else {
      prevAdx = (prevAdx * (period - 1) + cur) / period;
      adxArr[i] = prevAdx;
    }
  }
  return { adx: adxArr, plusDI, minusDI };
}

/** OBV (On-Balance Volume) */
export function obv(bars: Bar[]): number[] {
  const out: number[] = Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > bars[i - 1].close) out[i] = out[i - 1] + bars[i].volume;
    else if (bars[i].close < bars[i - 1].close) out[i] = out[i - 1] - bars[i].volume;
    else out[i] = out[i - 1];
  }
  return out;
}

/** 단순 수익률 배열 (r[i] = close[i]/close[i-1] - 1) */
export function simpleReturns(closes: number[]): number[] {
  const out: number[] = Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    out[i] = closes[i - 1] === 0 ? 0 : closes[i] / closes[i - 1] - 1;
  }
  return out;
}

/** Donchian 채널 (직전 period봉 최고/최저) */
export function donchian(bars: Bar[], period = 20): { upper: Num[]; lower: Num[] } {
  const upper: Num[] = Array(bars.length).fill(null);
  const lower: Num[] = Array(bars.length).fill(null);
  for (let i = period; i < bars.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period; j < i; j++) {
      hh = Math.max(hh, bars[j].high);
      ll = Math.min(ll, bars[j].low);
    }
    upper[i] = hh;
    lower[i] = ll;
  }
  return { upper, lower };
}
