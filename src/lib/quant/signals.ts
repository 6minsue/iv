// 종합 기술적 시그널: 여러 지표를 점수화해 매수/중립/매도 종합 판단

import type { Bar } from "./types";
import { sma, ema, rsi, macd, bollinger, stochastic, adx, atr } from "./indicators";

export type SignalTone = "bullish" | "bearish" | "neutral";

export interface IndicatorSignal {
  key: string;
  label: string;
  value: string;
  tone: SignalTone;
  detail: string;
  weight: number;
}

export interface CompositeSignal {
  symbol: string;
  asOf: string;
  price: number;
  score: number; // -100 ~ 100
  label: "강한 매수" | "매수" | "중립" | "매도" | "강한 매도";
  bullish: number;
  bearish: number;
  neutral: number;
  indicators: IndicatorSignal[];
}

const last = <T>(arr: T[]): T | undefined => arr[arr.length - 1];

function tone(score: number): SignalTone {
  if (score > 0) return "bullish";
  if (score < 0) return "bearish";
  return "neutral";
}

export function computeComposite(symbol: string, bars: Bar[]): CompositeSignal | null {
  if (bars.length < 60) return null;
  const closes = bars.map((b) => b.close);
  const price = closes[closes.length - 1];
  const isUS = !/^\d{6}$/.test(symbol);
  const fmt = (v: number) => (isUS ? `$${v.toFixed(2)}` : Math.round(v).toLocaleString("ko-KR"));

  const indicators: IndicatorSignal[] = [];
  const push = (s: IndicatorSignal) => indicators.push(s);

  // 1. EMA 20/60 추세
  const ema20 = last(ema(closes, 20)) ?? null;
  const ema60 = last(ema(closes, 60)) ?? null;
  if (ema20 != null && ema60 != null) {
    const diff = ((ema20 - ema60) / ema60) * 100;
    push({
      key: "ema_cross",
      label: "EMA 20/60",
      value: `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%`,
      tone: tone(ema20 - ema60),
      detail: ema20 > ema60 ? "단기선이 장기선 위 (상승추세)" : "단기선이 장기선 아래 (하락추세)",
      weight: 2,
    });
  }

  // 2. 가격 vs SMA20
  const sma20 = last(sma(closes, 20));
  if (sma20 != null) {
    push({
      key: "price_sma20",
      label: "SMA20 대비",
      value: fmt(sma20 as number),
      tone: tone(price - (sma20 as number)),
      detail: price > (sma20 as number) ? "20일선 위" : "20일선 아래",
      weight: 1,
    });
  }

  // 3. RSI(14)
  const rsiV = last(rsi(closes, 14));
  if (rsiV != null) {
    const v = rsiV as number;
    const t: SignalTone = v < 30 ? "bullish" : v > 70 ? "bearish" : "neutral";
    push({
      key: "rsi",
      label: "RSI(14)",
      value: v.toFixed(1),
      tone: t,
      detail: v < 30 ? "과매도" : v > 70 ? "과매수" : "중립 구간",
      weight: 1.5,
    });
  }

  // 4. MACD 히스토그램
  const m = macd(closes);
  const hist = last(m.histogram);
  const macdLine = last(m.macd);
  const sigLine = last(m.signal);
  if (hist != null && macdLine != null && sigLine != null) {
    push({
      key: "macd",
      label: "MACD",
      value: (hist as number).toFixed(3),
      tone: tone(hist as number),
      detail: (hist as number) > 0 ? "시그널선 상회 (강세)" : "시그널선 하회 (약세)",
      weight: 1.5,
    });
  }

  // 5. 볼린저 %B
  const bb = bollinger(closes, 20, 2);
  const pctB = last(bb.percentB);
  if (pctB != null) {
    const v = pctB as number;
    const t: SignalTone = v < 0 ? "bullish" : v > 1 ? "bearish" : "neutral";
    push({
      key: "bollinger",
      label: "볼린저 %B",
      value: v.toFixed(2),
      tone: t,
      detail: v < 0 ? "하단밴드 이탈 (반등기대)" : v > 1 ? "상단밴드 이탈 (과열)" : "밴드 내부",
      weight: 1,
    });
  }

  // 6. 스토캐스틱 %K
  const stoch = stochastic(bars, 14, 3);
  const k = last(stoch.k);
  if (k != null) {
    const v = k as number;
    const t: SignalTone = v < 20 ? "bullish" : v > 80 ? "bearish" : "neutral";
    push({
      key: "stoch",
      label: "스토캐스틱 %K",
      value: v.toFixed(1),
      tone: t,
      detail: v < 20 ? "과매도" : v > 80 ? "과매수" : "중립",
      weight: 1,
    });
  }

  // 7. ADX 추세 강도 + DI
  const adxR = adx(bars, 14);
  const adxV = last(adxR.adx);
  const plusDI = last(adxR.plusDI);
  const minusDI = last(adxR.minusDI);
  if (adxV != null && plusDI != null && minusDI != null) {
    const strong = (adxV as number) > 20;
    const bullTrend = (plusDI as number) > (minusDI as number);
    const t: SignalTone = !strong ? "neutral" : bullTrend ? "bullish" : "bearish";
    push({
      key: "adx",
      label: "ADX(14)",
      value: (adxV as number).toFixed(1),
      tone: t,
      detail: !strong
        ? "추세 약함 (<20)"
        : bullTrend
          ? `상승추세 (+DI>${(minusDI as number).toFixed(0)})`
          : "하락추세 (-DI 우위)",
      weight: 1.5,
    });
  }

  // 8. ATR 변동성 (정보성, 중립)
  const atrV = last(atr(bars, 14));
  if (atrV != null) {
    const pct = ((atrV as number) / price) * 100;
    push({
      key: "atr",
      label: "ATR(14)",
      value: `${pct.toFixed(2)}%`,
      tone: "neutral",
      detail: "일중 변동성 (포지션 사이징 참고)",
      weight: 0,
    });
  }

  // 종합 점수
  let weighted = 0;
  let totalWeight = 0;
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  for (const ind of indicators) {
    if (ind.tone === "bullish") bullish++;
    else if (ind.tone === "bearish") bearish++;
    else neutral++;
    if (ind.weight > 0) {
      totalWeight += ind.weight;
      weighted += ind.weight * (ind.tone === "bullish" ? 1 : ind.tone === "bearish" ? -1 : 0);
    }
  }
  const score = totalWeight > 0 ? Math.round((weighted / totalWeight) * 100) : 0;
  const label: CompositeSignal["label"] =
    score >= 50 ? "강한 매수" : score >= 15 ? "매수" : score <= -50 ? "강한 매도" : score <= -15 ? "매도" : "중립";

  return {
    symbol,
    asOf: bars[bars.length - 1].time,
    price,
    score,
    label,
    bullish,
    bearish,
    neutral,
    indicators,
  };
}
