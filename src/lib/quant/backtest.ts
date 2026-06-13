// 이벤트 기반 백테스트 엔진
// 시그널은 "해당 봉 종가 기준 목표 포지션"이며, 룩어헤드 방지를 위해 다음 봉 시가에 체결한다.

import type {
  Bar,
  Position,
  BacktestConfig,
  BacktestResult,
  Trade,
  EquityPoint,
  BacktestMetrics,
} from "./types";

export const DEFAULT_CONFIG: BacktestConfig = {
  initialCapital: 10_000_000,
  commission: 0.00015,
  slippage: 0.0005,
  allowShort: false,
  periodsPerYear: 252,
};

interface OpenPosition {
  side: "LONG" | "SHORT";
  entryPrice: number;
  quantity: number;
  entryTime: string;
  entryIndex: number;
}

/**
 * @param bars       오름차순 캔들
 * @param signals    각 봉의 목표 포지션 (-1/0/1), bars와 동일 길이. null은 0으로 간주.
 * @param config     백테스트 설정
 * @param startIndex 성과 집계 시작 인덱스(워크포워드 테스트 구간 등). 기본 0.
 */
export function runBacktest(
  bars: Bar[],
  signals: (Position | null)[],
  config: Partial<BacktestConfig> = {},
  startIndex = 0
): BacktestResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const trades: Trade[] = [];
  const equityCurve: EquityPoint[] = [];

  let cash = cfg.initialCapital;
  let open: OpenPosition | null = null;
  let peak = cfg.initialCapital;
  let maxDrawdown = 0;
  let barsInMarket = 0;

  const begin = Math.max(1, startIndex);
  const buyHoldEntry = bars[begin]?.open || bars[begin]?.close || bars[0].close;

  const equityReturns: number[] = [];
  let prevEquity = cfg.initialCapital;

  // 평가금액 (현금 + 포지션 평가)
  const markToMarket = (price: number): number => {
    if (!open) return cash;
    if (open.side === "LONG") return cash + open.quantity * price;
    // 숏: 진입 명목(담보) + 미실현손익. cash엔 수수료만 차감되어 있음.
    return cash + open.entryPrice * open.quantity + (open.entryPrice - price) * open.quantity;
  };

  const enter = (side: "LONG" | "SHORT", price: number, time: string, index: number) => {
    const execPrice = side === "LONG" ? price * (1 + cfg.slippage) : price * (1 - cfg.slippage);
    if (execPrice <= 0) return;
    const notional = cash; // 가용 현금 전액 투입
    const quantity = notional / execPrice;
    const commission = notional * cfg.commission;
    if (side === "LONG") {
      cash -= execPrice * quantity + commission;
    } else {
      cash -= commission; // 담보·손익은 평가식에서 반영
    }
    open = { side, entryPrice: execPrice, quantity, entryTime: time, entryIndex: index };
  };

  const exit = (price: number, time: string, index: number) => {
    if (!open) return;
    const execPrice = open.side === "LONG" ? price * (1 - cfg.slippage) : price * (1 + cfg.slippage);
    const notional = open.entryPrice * open.quantity;
    const exitCommission = execPrice * open.quantity * cfg.commission;
    const entryCommission = notional * cfg.commission;
    let pnl: number;
    if (open.side === "LONG") {
      cash += execPrice * open.quantity - exitCommission;
      pnl = (execPrice - open.entryPrice) * open.quantity - exitCommission - entryCommission;
    } else {
      cash += (open.entryPrice - execPrice) * open.quantity - exitCommission;
      pnl = (open.entryPrice - execPrice) * open.quantity - exitCommission - entryCommission;
    }
    trades.push({
      side: open.side,
      entryTime: open.entryTime,
      exitTime: time,
      entryPrice: open.entryPrice,
      exitPrice: execPrice,
      quantity: open.quantity,
      pnl,
      pnlPct: notional === 0 ? 0 : (pnl / notional) * 100,
      barsHeld: index - open.entryIndex,
    });
    open = null;
  };

  for (let i = begin; i < bars.length; i++) {
    const bar = bars[i];
    // 직전 봉 종가의 시그널로 이번 봉 시가에 체결 (룩어헤드 방지)
    const rawTarget: Position = (signals[i - 1] ?? 0) as Position;
    const desired: Position = cfg.allowShort ? rawTarget : rawTarget > 0 ? 1 : 0;
    // 클로저(enter/exit)가 open을 변경하므로 CFA 우회를 위해 단언 사용
    const cur = open as OpenPosition | null;
    const currentSide: Position = cur ? (cur.side === "LONG" ? 1 : -1) : 0;

    if (desired !== currentSide) {
      if (open) exit(bar.open, bar.time, i);
      if (desired === 1) enter("LONG", bar.open, bar.time, i);
      else if (desired === -1) enter("SHORT", bar.open, bar.time, i);
    }

    if (open) barsInMarket++;

    const equity = markToMarket(bar.close);
    peak = Math.max(peak, equity);
    const dd = peak > 0 ? (equity - peak) / peak : 0;
    maxDrawdown = Math.min(maxDrawdown, dd);

    if (i > begin) equityReturns.push(prevEquity === 0 ? 0 : equity / prevEquity - 1);
    prevEquity = equity;

    equityCurve.push({
      time: bar.time,
      equity,
      drawdown: dd * 100,
      buyHold: cfg.initialCapital * (bar.close / buyHoldEntry),
      position: currentSide,
    });
  }

  // 종료 시 잔여 포지션 청산
  if (open) {
    const lastBar = bars[bars.length - 1];
    exit(lastBar.close, lastBar.time, bars.length - 1);
    if (equityCurve.length) equityCurve[equityCurve.length - 1].equity = cash;
  }

  const finalEquity = equityCurve.length ? equityCurve[equityCurve.length - 1].equity : cfg.initialCapital;
  const lastClose = bars[bars.length - 1].close;
  const metrics = computeMetrics(
    cfg,
    finalEquity,
    equityReturns,
    maxDrawdown,
    trades,
    barsInMarket,
    bars.length - begin,
    lastClose / buyHoldEntry - 1
  );

  return { equityCurve, trades, metrics };
}

function computeMetrics(
  cfg: BacktestConfig,
  finalEquity: number,
  rets: number[],
  maxDrawdown: number,
  trades: Trade[],
  barsInMarket: number,
  totalBars: number,
  buyHoldReturn: number
): BacktestMetrics {
  const totalReturn = finalEquity / cfg.initialCapital - 1;
  const years = totalBars / cfg.periodsPerYear;
  const cagr =
    years > 0 && finalEquity > 0 ? Math.pow(finalEquity / cfg.initialCapital, 1 / years) - 1 : 0;

  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const variance = rets.length ? rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length : 0;
  const std = Math.sqrt(variance);
  const downside = rets.filter((r) => r < 0);
  const downsideStd = downside.length
    ? Math.sqrt(downside.reduce((a, b) => a + b * b, 0) / downside.length)
    : 0;

  const ann = Math.sqrt(cfg.periodsPerYear);
  const volatility = std * ann;
  const sharpe = std === 0 ? 0 : (mean / std) * ann;
  const sortino = downsideStd === 0 ? 0 : (mean / downsideStd) * ann;
  const calmar = maxDrawdown === 0 ? 0 : cagr / Math.abs(maxDrawdown);

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossProfit = wins.reduce((a, b) => a + b.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b.pnl, 0));
  const winRate = trades.length ? wins.length / trades.length : 0;
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 99 : 0) : grossProfit / grossLoss;
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? -grossLoss / losses.length : 0;
  const avgHoldBars = trades.length ? trades.reduce((a, b) => a + b.barsHeld, 0) / trades.length : 0;

  return {
    totalReturn,
    cagr,
    volatility,
    sharpe,
    sortino,
    maxDrawdown,
    calmar,
    winRate,
    profitFactor,
    avgWin,
    avgLoss,
    avgHoldBars,
    exposure: totalBars > 0 ? barsInMarket / totalBars : 0,
    numTrades: trades.length,
    buyHoldReturn,
    finalEquity,
  };
}
