import { NextRequest, NextResponse } from "next/server";
import { tossGet, clearTokenCache } from "@/lib/toss-api";
import axios from "axios";

interface TossCandle {
  timestamp?: string;
  time?: string;
  date?: string;
  openPrice?: string;
  highPrice?: string;
  lowPrice?: string;
  closePrice?: string;
  volume?: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol = searchParams.get("symbol");
  const interval = searchParams.get("interval") ?? "1d";
  const count = searchParams.get("count") ?? "60";

  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const fetchCandles = async (retry = false): Promise<NextResponse> => {
    try {
      const data = await tossGet<unknown>("/api/v1/candles", { symbol, interval, count: Number(count) });
      const result = (data as { result?: { candles?: TossCandle[] } | TossCandle[] }).result;
      const raw: TossCandle[] = Array.isArray(result)
        ? result
        : (result as { candles?: TossCandle[] })?.candles ?? [];

      const candles = raw
        .map((c) => ({
          time: c.timestamp ?? c.time ?? c.date ?? "",
          open: Number(c.openPrice),
          high: Number(c.highPrice),
          low: Number(c.lowPrice),
          close: Number(c.closePrice),
          volume: Number(c.volume),
        }))
        // 오름차순 정렬 (과거 → 최신)
        .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

      return NextResponse.json({ candles });
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        if (e.response?.status === 401 && !retry) {
          clearTokenCache();
          return fetchCandles(true);
        }
        return NextResponse.json(e.response?.data ?? { error: e.message }, { status: e.response?.status ?? 500 });
      }
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  };

  return fetchCandles();
}
