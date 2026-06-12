import { NextResponse } from "next/server";
import { tossGet } from "@/lib/toss-api";
import axios from "axios";

let cache: { rate: number; ts: number } | null = null;
const TTL = 5 * 60 * 1000; // 5분 캐시

export async function GET() {
  if (cache && Date.now() - cache.ts < TTL) {
    return NextResponse.json({ rate: cache.rate, cached: true });
  }

  try {
    const data = await tossGet<unknown>("/api/v1/exchange-rate", {
      baseCurrency: "USD",
      quoteCurrency: "KRW",
    });
    const r = (data as { result?: { rate?: string } }).result;
    const rate = Number(r?.rate ?? 1400);
    cache = { rate, ts: Date.now() };
    return NextResponse.json({ rate, validFrom: (r as Record<string, unknown>)?.validFrom });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return NextResponse.json(e.response?.data ?? { error: e.message }, { status: e.response?.status ?? 500 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
