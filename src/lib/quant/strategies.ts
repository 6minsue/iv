// 기술적 전략: 캔들 → 각 봉의 목표 포지션 시그널(-1/0/1)
// 시그널[i] 는 i번째 봉 "종가" 시점 판단이며, 백테스터가 i+1 봉 시가에 체결한다.

import type { Bar, Position, StrategyId, StrategyParams } from "./types";
import { ema, rsi, macd, bollinger, donchian } from "./indicators";

export interface StrategyMeta {
  id: StrategyId;
  name: string;
  description: string;
  defaults: StrategyParams;
}

export const STRATEGIES: StrategyMeta[] = [
  {
    id: "ma_crossover",
    name: "이동평균 교차",
    description: "단기 EMA가 장기 EMA를 상향 돌파(골든크로스)하면 롱, 하향 돌파(데드크로스)하면 청산.",
    defaults: { fast: 20, slow: 60 },
  },
  {
    id: "rsi_reversion",
    name: "RSI 평균회귀",
    description: "RSI가 과매도(<30) 진입 시 매수, 과매수(>70) 도달 시 청산하는 역추세 전략.",
    defaults: { rsiPeriod: 14, oversold: 30, overbought: 70 },
  },
  {
    id: "macd",
    name: "MACD 추세추종",
    description: "MACD 히스토그램이 0을 상향 돌파하면 롱, 하향 돌파하면 청산.",
    defaults: { macdFast: 12, macdSlow: 26, macdSignal: 9 },
  },
  {
    id: "bollinger_reversion",
    name: "볼린저 평균회귀",
    description: "종가가 하단 밴드 아래로 이탈하면 매수, 중심선(SMA) 회복 시 청산.",
    defaults: { bbPeriod: 20, bbK: 2 },
  },
  {
    id: "donchian_breakout",
    name: "돈키언 채널 돌파",
    description: "직전 N봉 고점을 돌파하면 매수, 직전 N봉 저점을 이탈하면 청산하는 추세 추종(터틀).",
    defaults: { channel: 20 },
  },
  {
    id: "ml",
    name: "ML 예측 (로지스틱/신경망)",
    description: "기술적 피처로 다음 구간 상승 확률을 학습해 임계값 초과 시 롱. 워크포워드 아웃오브샘플 평가.",
    defaults: {},
  },
  {
    id: "rl",
    name: "강화학습 (Q-러닝)",
    description: "이산화된 기술적 국면을 상태로 보상(비용차감 수익률)을 최대화하는 매매 정책을 스스로 학습.",
    defaults: {},
  },
];

export function getStrategyMeta(id: StrategyId): StrategyMeta | undefined {
  return STRATEGIES.find((s) => s.id === id);
}

/** 상태 유지 헬퍼: null을 직전 포지션으로 전진 채움 */
function forwardFill(signals: (Position | null)[]): Position[] {
  const out: Position[] = [];
  let prev: Position = 0;
  for (const s of signals) {
    if (s != null) prev = s;
    out.push(prev);
  }
  return out;
}

export function generateSignals(
  bars: Bar[],
  strategy: StrategyId,
  params: StrategyParams = {}
): Position[] {
  const closes = bars.map((b) => b.close);
  const n = bars.length;
  const raw: (Position | null)[] = Array(n).fill(null);

  switch (strategy) {
    case "ma_crossover": {
      const fast = ema(closes, params.fast ?? 20);
      const slow = ema(closes, params.slow ?? 60);
      for (let i = 0; i < n; i++) {
        if (fast[i] == null || slow[i] == null) continue;
        raw[i] = (fast[i] as number) > (slow[i] as number) ? 1 : 0;
      }
      return forwardFill(raw);
    }

    case "rsi_reversion": {
      const r = rsi(closes, params.rsiPeriod ?? 14);
      const os = params.oversold ?? 30;
      const ob = params.overbought ?? 70;
      let pos: Position = 0;
      for (let i = 0; i < n; i++) {
        const v = r[i];
        if (v == null) {
          raw[i] = 0;
          continue;
        }
        if (pos === 0 && v < os) pos = 1;
        else if (pos === 1 && v > ob) pos = 0;
        raw[i] = pos;
      }
      return forwardFill(raw);
    }

    case "macd": {
      const m = macd(closes, params.macdFast ?? 12, params.macdSlow ?? 26, params.macdSignal ?? 9);
      for (let i = 0; i < n; i++) {
        const h = m.histogram[i];
        if (h == null) continue;
        raw[i] = h > 0 ? 1 : 0;
      }
      return forwardFill(raw);
    }

    case "bollinger_reversion": {
      const bb = bollinger(closes, params.bbPeriod ?? 20, params.bbK ?? 2);
      let pos: Position = 0;
      for (let i = 0; i < n; i++) {
        const lower = bb.lower[i];
        const mid = bb.middle[i];
        if (lower == null || mid == null) {
          raw[i] = pos;
          continue;
        }
        if (pos === 0 && closes[i] < lower) pos = 1;
        else if (pos === 1 && closes[i] > mid) pos = 0;
        raw[i] = pos;
      }
      return forwardFill(raw);
    }

    case "donchian_breakout": {
      const ch = params.channel ?? 20;
      const dc = donchian(bars, ch);
      let pos: Position = 0;
      for (let i = 0; i < n; i++) {
        const up = dc.upper[i];
        const lo = dc.lower[i];
        if (up == null || lo == null) {
          raw[i] = pos;
          continue;
        }
        if (pos === 0 && closes[i] >= up) pos = 1;
        else if (pos === 1 && closes[i] <= lo) pos = 0;
        raw[i] = pos;
      }
      return forwardFill(raw);
    }

    case "ml":
    case "rl":
      // ML/RL 시그널은 별도 모듈(ml.ts/rl.ts)에서 학습 후 생성
      return Array(n).fill(0);

    default:
      return Array(n).fill(0);
  }
}
