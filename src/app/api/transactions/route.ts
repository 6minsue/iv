import { NextRequest, NextResponse } from "next/server";
import { tossGet } from "@/lib/toss-api";
import { fetchCandlesServer } from "@/lib/server/candles";
import axios from "axios";

interface TossOrder {
  orderId: string; symbol: string; side: "BUY" | "SELL"; status: string;
  price: string; quantity: string; orderAmount: string; currency: string; orderedAt: string;
  execution: { filledQuantity: string; averageFilledPrice: string | null; filledAmount: string; commission: string; tax: string | null; filledAt: string | null; settlementDate: string | null };
}
interface Tx {
  date: string; datetime: string; symbol: string; side: "BUY" | "SELL";
  quantity: number; price: number; amount: number; commission: number; tax: number; currency: string;
}

export async function GET(req: NextRequest) {
  const accountSeq = req.nextUrl.searchParams.get("accountSeq");
  const exchangeRate = Number(req.nextUrl.searchParams.get("exchangeRate") ?? 1400);
  if (!accountSeq) return NextResponse.json({ error: "accountSeq required" }, { status: 400 });

  try {
    // 체결 거래내역 수집 (커서 페이지네이션, 최대 8페이지)
    const orders: TossOrder[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 8; page++) {
      const params: Record<string, string | number> = { status: "CLOSED", limit: 100 };
      if (cursor) params.cursor = cursor;
      const data = await tossGet<{ result: { orders: TossOrder[]; nextCursor?: string; hasNext?: boolean } }>("/api/v1/orders", params, accountSeq);
      const r = data.result;
      orders.push(...(r.orders ?? []));
      if (!r.hasNext || !r.nextCursor) break;
      cursor = r.nextCursor;
    }

    // 체결분만 정규화
    const txs: Tx[] = orders
      .filter((o) => Number(o.execution?.filledQuantity ?? 0) > 0)
      .map((o) => {
        const dt = o.execution.filledAt ?? o.orderedAt;
        return {
          date: dt.slice(0, 10),
          datetime: dt,
          symbol: o.symbol,
          side: o.side,
          quantity: Number(o.execution.filledQuantity),
          price: Number(o.execution.averageFilledPrice ?? o.price),
          amount: Number(o.execution.filledAmount ?? 0),
          commission: Number(o.execution.commission ?? 0),
          tax: Number(o.execution.tax ?? 0),
          currency: o.currency,
        };
      })
      .sort((a, b) => a.datetime.localeCompare(b.datetime));

    if (txs.length === 0) {
      return NextResponse.json({ transactions: [], valueHistory: [], summary: null });
    }

    const symbols = [...new Set(txs.map((t) => t.symbol))];
    const currencyOf = new Map(txs.map((t) => [t.symbol, t.currency]));
    const fxOf = (sym: string) => (currencyOf.get(sym) === "USD" ? exchangeRate : 1);

    // 종목별 캔들 (거래 시작일~현재 커버)
    const closeBy = new Map<string, Map<string, number>>();
    const candleDates = new Set<string>();
    for (const sym of symbols) {
      try {
        const bars = await fetchCandlesServer(sym, "1d", 400);
        const m = new Map<string, number>();
        for (const b of bars) { m.set(b.time.slice(0, 10), b.close); candleDates.add(b.time.slice(0, 10)); }
        closeBy.set(sym, m);
      } catch { /* 개별 실패 무시 */ }
    }

    const firstTxDate = txs[0].date;
    const allDates = [...candleDates].filter((d) => d >= firstTxDate).sort();

    // 거래 재생 → 일자별 정확한 보유수량·평단·가치·원금
    let txPtr = 0;
    const pos = new Map<string, { qty: number; avgCost: number }>();
    const lastClose = new Map<string, number>();
    let realizedPnl = 0;
    const valueHistory: { date: string; value: number; cost: number }[] = [];

    for (const date of allDates) {
      // 캔들 종가 forward-fill
      for (const sym of symbols) { const c = closeBy.get(sym)?.get(date); if (c != null) lastClose.set(sym, c); }
      // 이 날짜까지의 거래 적용
      while (txPtr < txs.length && txs[txPtr].date <= date) {
        const t = txs[txPtr];
        const p = pos.get(t.symbol) ?? { qty: 0, avgCost: 0 };
        if (t.side === "BUY") {
          const nq = p.qty + t.quantity;
          p.avgCost = nq > 0 ? (p.avgCost * p.qty + t.price * t.quantity + t.commission) / nq : 0;
          p.qty = nq;
        } else {
          realizedPnl += (t.price - p.avgCost) * t.quantity * fxOf(t.symbol) - (t.commission + t.tax) * fxOf(t.symbol);
          p.qty = Math.max(0, p.qty - t.quantity);
        }
        pos.set(t.symbol, p);
        txPtr++;
      }
      // 일자별 가치/원금 (KRW)
      let value = 0, cost = 0;
      for (const [sym, p] of pos) {
        if (p.qty <= 1e-9) continue;
        const cl = lastClose.get(sym);
        if (cl == null) continue;
        const f = fxOf(sym);
        value += p.qty * cl * f;
        cost += p.qty * p.avgCost * f;
      }
      valueHistory.push({ date, value, cost });
    }

    const lastV = valueHistory[valueHistory.length - 1] ?? { value: 0, cost: 0 };
    const totalBuy = txs.filter((t) => t.side === "BUY").reduce((s, t) => s + t.amount * fxOf(t.symbol), 0);
    const totalSell = txs.filter((t) => t.side === "SELL").reduce((s, t) => s + t.amount * fxOf(t.symbol), 0);

    return NextResponse.json({
      transactions: txs.slice().reverse(), // 최신순
      valueHistory,
      summary: {
        txCount: txs.length,
        buyCount: txs.filter((t) => t.side === "BUY").length,
        sellCount: txs.filter((t) => t.side === "SELL").length,
        firstDate: firstTxDate,
        totalBuyKRW: totalBuy,
        totalSellKRW: totalSell,
        realizedPnlKRW: realizedPnl,
        currentValueKRW: lastV.value,
        currentCostKRW: lastV.cost,
        unrealizedPnlKRW: lastV.value - lastV.cost,
      },
    });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return NextResponse.json(e.response?.data ?? { error: e.message }, { status: e.response?.status ?? 500 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
