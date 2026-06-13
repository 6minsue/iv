// 실행가능 인사이트 엔진: "언제 사서, 언제 팔지, 얼마를" + 평균 수익률·기대값·해설
// 백테스트 결과를 사람이 바로 행동할 수 있는 추천으로 변환한다.

import type { Bar, Position, Trade } from "./types";
import { atr, rsi, sma } from "./indicators";

export interface TradeStats {
  totalTrades: number;
  winRate: number;
  avgReturnPct: number;
  medianReturnPct: number;
  avgWinPct: number;
  avgLossPct: number;
  expectancyPct: number; // 거래당 기대값
  profitFactor: number;
  avgHoldBars: number;
  bestTradePct: number;
  worstTradePct: number;
  maxConsecLoss: number;
}

export interface Recommendation {
  action: "BUY" | "HOLD" | "SELL" | "WAIT";
  reason: string;
  inPosition: boolean;
  signalAgeBars: number;
  price: number;
  stopLoss: number;
  takeProfit: number;
  atr: number;
  atrPct: number;
  riskRewardRatio: number;
  suggestedShares: number;
  suggestedAmountNative: number;
  suggestedAmountKRW: number;
  conviction: "높음" | "보통" | "낮음";
  unrealizedPct: number | null;
}

export interface AnalysisResult {
  recommendation: Recommendation;
  stats: TradeStats;
  insights: string[];
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function computeTradeStats(trades: Trade[]): TradeStats {
  const rets = trades.map((t) => t.pnlPct);
  const wins = rets.filter((r) => r > 0);
  const losses = rets.filter((r) => r <= 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const winRate = rets.length ? wins.length / rets.length : 0;
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? -grossLoss / losses.length : 0;

  let consec = 0;
  let maxConsec = 0;
  for (const r of rets) {
    if (r <= 0) {
      consec++;
      maxConsec = Math.max(maxConsec, consec);
    } else consec = 0;
  }

  return {
    totalTrades: trades.length,
    winRate,
    avgReturnPct: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0,
    medianReturnPct: median(rets),
    avgWinPct: avgWin,
    avgLossPct: avgLoss,
    expectancyPct: winRate * avgWin + (1 - winRate) * avgLoss,
    profitFactor: grossLoss === 0 ? (grossWin > 0 ? 99 : 0) : grossWin / grossLoss,
    avgHoldBars: trades.length ? trades.reduce((a, b) => a + b.barsHeld, 0) / trades.length : 0,
    bestTradePct: rets.length ? Math.max(...rets) : 0,
    worstTradePct: rets.length ? Math.min(...rets) : 0,
    maxConsecLoss: maxConsec,
  };
}

export function analyzeStrategy(
  bars: Bar[],
  signals: Position[],
  trades: Trade[],
  opts: { isUS: boolean; exchangeRate: number; budgetKRW: number; atrMult?: number; rrRatio?: number }
): AnalysisResult {
  const n = bars.length;
  const closes = bars.map((b) => b.close);
  const price = closes[n - 1];
  const atrMult = opts.atrMult ?? 2;
  const rr = opts.rrRatio ?? 1.5;

  const atrArr = atr(bars, 14);
  const atrVal = (atrArr[n - 1] as number) || price * 0.02;
  const atrPct = atrVal / price;

  const cur = signals[n - 1] ?? 0;
  const prev = signals[n - 2] ?? 0;
  const inPosition = cur === 1;

  // 현재 시그널이 며칠째인지
  let age = 1;
  for (let i = n - 2; i >= 0; i--) {
    if ((signals[i] ?? 0) === cur) age++;
    else break;
  }

  let action: Recommendation["action"];
  let reason: string;
  if (cur === 1 && prev !== 1) {
    action = "BUY";
    reason = "신규 매수 신호 발생 — 전략이 상승 진입 시점으로 판단";
  } else if (cur === 1 && prev === 1) {
    action = "HOLD";
    reason = `매수 포지션 유지 중 (${age}봉째) — 추세 지속`;
  } else if (cur !== 1 && prev === 1) {
    action = "SELL";
    reason = "청산(매도) 신호 — 전략이 추세 종료로 판단";
  } else {
    action = "WAIT";
    reason = `관망 (${age}봉째 현금) — 명확한 매수 신호 대기`;
  }

  const stopLoss = price - atrMult * atrVal;
  const takeProfit = price + atrMult * rr * atrVal;
  const riskRewardRatio = price - stopLoss > 0 ? (takeProfit - price) / (price - stopLoss) : rr;

  // 포지션 크기: 예산(원) 한도 내
  const budgetNative = opts.isUS ? opts.budgetKRW / Math.max(opts.exchangeRate, 1) : opts.budgetKRW;
  const rawShares = budgetNative / price;
  const suggestedShares = opts.isUS ? Math.floor(rawShares * 10000) / 10000 : Math.floor(rawShares);
  const suggestedAmountNative = suggestedShares * price;
  const suggestedAmountKRW = opts.isUS ? suggestedAmountNative * opts.exchangeRate : suggestedAmountNative;

  // 미실현 (보유 중이면 현재 시그널 시작 봉을 진입가로 추정)
  let unrealizedPct: number | null = null;
  if (inPosition && age >= 1 && n - age >= 0) {
    const entry = closes[Math.max(0, n - age)];
    unrealizedPct = entry > 0 ? (price / entry - 1) * 100 : null;
  }

  const stats = computeTradeStats(trades);

  // 확신도
  let conviction: Recommendation["conviction"] = "보통";
  if (stats.totalTrades >= 5) {
    if (stats.winRate >= 0.55 && stats.expectancyPct > 0 && stats.profitFactor >= 1.3) conviction = "높음";
    else if (stats.expectancyPct <= 0 || stats.profitFactor < 1) conviction = "낮음";
  } else {
    conviction = "낮음"; // 표본 부족
  }

  const recommendation: Recommendation = {
    action, reason, inPosition, signalAgeBars: age, price,
    stopLoss, takeProfit, atr: atrVal, atrPct, riskRewardRatio,
    suggestedShares, suggestedAmountNative, suggestedAmountKRW, conviction, unrealizedPct,
  };

  // 자연어 인사이트
  const fmtP = (v: number) => (opts.isUS ? `$${v.toFixed(2)}` : `${Math.round(v).toLocaleString("ko-KR")}원`);
  const insights: string[] = [];

  if (action === "BUY") {
    insights.push(`🟢 지금이 진입 시점입니다. ${fmtP(price)} 부근 매수 → 손절 ${fmtP(stopLoss)} (${(-atrMult * atrPct * 100).toFixed(1)}%), 목표 ${fmtP(takeProfit)} (+${(atrMult * rr * atrPct * 100).toFixed(1)}%). 손익비 1:${riskRewardRatio.toFixed(1)}.`);
  } else if (action === "HOLD") {
    insights.push(`🔵 보유 지속 권고. 진입 후 ${age}봉 경과, 미실현 ${unrealizedPct != null ? (unrealizedPct >= 0 ? "+" : "") + unrealizedPct.toFixed(1) + "%" : "-"}. 손절선 ${fmtP(stopLoss)}로 상향 관리.`);
  } else if (action === "SELL") {
    insights.push(`🔴 청산 권고. 추세 종료 신호 — 이익 실현/손실 제한을 위해 포지션 정리.`);
  } else {
    insights.push(`⚪ 관망. 아직 매수 우위 신호 없음. 신호 발생 시 ${fmtP(price)} 기준 진입 검토.`);
  }

  if (stats.totalTrades > 0) {
    insights.push(`📊 이 전략은 과거 ${stats.totalTrades}회 거래에서 거래당 평균 ${stats.avgReturnPct >= 0 ? "+" : ""}${stats.avgReturnPct.toFixed(2)}%, 승률 ${(stats.winRate * 100).toFixed(0)}%, 평균 보유 ${stats.avgHoldBars.toFixed(0)}봉.`);
    insights.push(`💡 기대값 ${stats.expectancyPct >= 0 ? "+" : ""}${stats.expectancyPct.toFixed(2)}%/거래 · 손익비(PF) ${stats.profitFactor.toFixed(2)} · 평균이익 +${stats.avgWinPct.toFixed(1)}% vs 평균손실 ${stats.avgLossPct.toFixed(1)}%.`);
    if (stats.expectancyPct > 0 && stats.profitFactor >= 1.3) {
      insights.push(`✅ 통계적으로 우위가 있는 전략입니다 (기대값 양수 + PF≥1.3). 다만 최대 연속손실 ${stats.maxConsecLoss}회를 견딜 자금관리 필요.`);
    } else if (stats.expectancyPct <= 0) {
      insights.push(`⚠️ 비용 차감 후 기대값이 음수입니다. 이 종목/주기에서는 이 전략을 권하지 않습니다.`);
    }
  } else {
    insights.push(`📊 이 구간에서 체결된 거래가 없습니다. 신호 조건이 충족되지 않았습니다.`);
  }

  // 국면 진단
  const sma20v = sma(closes, 20)[n - 1];
  const rsiV = rsi(closes, 14)[n - 1];
  const ret20 = n > 20 ? (closes[n - 1] / closes[n - 21] - 1) * 100 : 0;
  const regime = ret20 > 5 ? "상승" : ret20 < -5 ? "하락" : "횡보";
  insights.push(`🌐 최근 20봉 ${regime} 국면 (${ret20 >= 0 ? "+" : ""}${ret20.toFixed(1)}%)${sma20v != null ? `, 20일선 ${price > (sma20v as number) ? "상회" : "하회"}` : ""}${rsiV != null ? `, RSI ${(rsiV as number).toFixed(0)}` : ""}.`);

  if (stats.totalTrades < 5 && stats.totalTrades > 0) {
    insights.push(`🔎 표본이 ${stats.totalTrades}거래로 적어 통계 신뢰도가 낮습니다. 워크포워드 탭에서 여러 기간 검증을 권장합니다.`);
  }

  return { recommendation, stats, insights };
}
