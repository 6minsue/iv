import { NextRequest, NextResponse } from "next/server";
import { tossGet } from "@/lib/toss-api";
import axios from "axios";

interface TossPrice {
  symbol: string;
  symbolName?: string;
  name?: string;
  lastPrice?: string;
  currentPrice?: string;
  changePrice?: string;
  changeRate?: string;
  openPrice?: string;
  highPrice?: string;
  lowPrice?: string;
  volume?: string;
  currency?: string;
}

interface TossCandle {
  timestamp?: string;
  openPrice?: string;
  highPrice?: string;
  lowPrice?: string;
  closePrice?: string;
  volume?: string;
}

async function fetchCandles(symbol: string, count = 2) {
  try {
    const data = await tossGet<unknown>("/api/v1/candles", { symbol, interval: "1d", count });
    const result = (data as { result?: { candles?: TossCandle[] } }).result;
    const raw: TossCandle[] = result?.candles ?? (Array.isArray(result) ? result as TossCandle[] : []);
    return raw
      .map((c) => ({
        time: (c as { timestamp?: string }).timestamp ?? "",
        open: Number(c.openPrice),
        high: Number(c.highPrice),
        low: Number(c.lowPrice),
        close: Number(c.closePrice),
        volume: Number(c.volume),
      }))
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbols = searchParams.get("symbols");
  if (!symbols) return NextResponse.json({ error: "symbols required" }, { status: 400 });

  // fast=1: 실시간 폴링용 — 캔들 불필요, currentPrice만 반환
  const fast = searchParams.get("fast") === "1";

  try {
    const data = await tossGet<{ result: TossPrice[] }>("/api/v1/prices", { symbols });
    const raw: TossPrice[] = Array.isArray(data) ? data : ((data as { result?: TossPrice[] }).result ?? []);

    if (fast) {
      const prices = raw.map((p) => ({
        symbol: p.symbol,
        currentPrice: Number(p.lastPrice ?? p.currentPrice ?? 0),
        currency: p.currency ?? "KRW",
      }));
      return NextResponse.json({ prices });
    }

    // 각 종목의 캔들(최근 2일)을 병렬 조회하여 전일 대비 변동 계산
    const symbolList = raw.map((p) => p.symbol);
    const candleResults = await Promise.all(symbolList.map((s) => fetchCandles(s, 2)));

    const prices = raw.map((p, i) => {
      const candles = candleResults[i];
      const lastPrice = Number(p.lastPrice ?? p.currentPrice ?? 0);
      let changePrice = 0;
      let changeRate = 0;
      let openPrice = 0;
      let highPrice = 0;
      let lowPrice = 0;
      let volume = 0;

      if (candles.length >= 2) {
        const prevClose = candles[candles.length - 2].close;
        const todayCandle = candles[candles.length - 1];
        changePrice = lastPrice - prevClose;
        changeRate = prevClose > 0 ? (changePrice / prevClose) * 100 : 0;
        openPrice = todayCandle.open;
        highPrice = todayCandle.high;
        lowPrice = todayCandle.low;
        volume = todayCandle.volume;
      } else if (candles.length === 1) {
        const c = candles[0];
        openPrice = c.open;
        highPrice = c.high;
        lowPrice = c.low;
        volume = c.volume;
        changePrice = lastPrice - c.open;
        changeRate = c.open > 0 ? (changePrice / c.open) * 100 : 0;
      }

      return {
        symbol: p.symbol,
        symbolName: p.symbolName ?? p.name ?? p.symbol,
        currentPrice: lastPrice,
        changePrice: Number(p.changePrice ?? changePrice),
        changeRate: Number(p.changeRate ?? changeRate),
        openPrice: Number(p.openPrice ?? openPrice),
        highPrice: Number(p.highPrice ?? highPrice),
        lowPrice: Number(p.lowPrice ?? lowPrice),
        volume: Number(p.volume ?? volume),
        currency: p.currency ?? "KRW",
      };
    });

    return NextResponse.json({ prices });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return NextResponse.json(e.response?.data ?? { error: e.message }, { status: e.response?.status ?? 500 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
