import { NextRequest, NextResponse } from "next/server";
import { fetchCandlesServer } from "@/lib/server/candles";
import axios from "axios";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol = searchParams.get("symbol");
  const interval = searchParams.get("interval") ?? "1d";
  const count = Number(searchParams.get("count") ?? "120");

  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  try {
    // fetchCandlesServer: 1m/1d 기본 조회 + 1w/5m/15m 리샘플링 + before 페이지네이션 + 캐시
    const candles = await fetchCandlesServer(symbol, interval, count);
    return NextResponse.json({ candles });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return NextResponse.json(e.response?.data ?? { error: e.message }, { status: e.response?.status ?? 500 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
