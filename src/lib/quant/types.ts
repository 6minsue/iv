// 퀀트 엔진 공용 타입

export interface Bar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** 목표 포지션: -1 숏 / 0 현금 / 1 롱 */
export type Position = -1 | 0 | 1;

export type StrategyId =
  | "ma_crossover"
  | "rsi_reversion"
  | "macd"
  | "bollinger_reversion"
  | "donchian_breakout"
  | "ml"
  | "rl";

export interface StrategyParams {
  // MA crossover
  fast?: number;
  slow?: number;
  // RSI
  rsiPeriod?: number;
  oversold?: number;
  overbought?: number;
  // Bollinger
  bbPeriod?: number;
  bbK?: number;
  // Donchian
  channel?: number;
  // MACD
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
}

export interface BacktestConfig {
  initialCapital: number;
  /** 편도 수수료율 (예: 0.00015 = 0.015%). 미국주식은 환전 우대 포함 0.0015 권장 */
  commission: number;
  /** 슬리피지율 (체결 불리 폭) */
  slippage: number;
  /** 매도 시 부과되는 세금(국내 증권거래세 등). 미국은 0. 매도 체결에만 적용 */
  sellTax: number;
  allowShort: boolean;
  periodsPerYear: number;
}

export interface Trade {
  side: "LONG" | "SHORT";
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPct: number;
  barsHeld: number;
}

export interface EquityPoint {
  time: string;
  equity: number;
  /** 0~음수(%) 낙폭 */
  drawdown: number;
  /** 매수후보유(Buy & Hold) 정규화 자산곡선 — 동일 초기자본 기준 */
  buyHold: number;
  position: Position;
}

export interface BacktestMetrics {
  totalReturn: number;
  cagr: number;
  volatility: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  calmar: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  avgHoldBars: number;
  exposure: number;
  numTrades: number;
  buyHoldReturn: number;
  finalEquity: number;
}

export interface BacktestResult {
  equityCurve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
}

export const PERIODS_PER_YEAR: Record<string, number> = {
  "1m": 252 * 390,
  "5m": 252 * 78,
  "15m": 252 * 26,
  "30m": 252 * 13,
  "1h": 252 * 7,
  "1d": 252,
  "1w": 52,
};
