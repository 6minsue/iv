import { NextRequest, NextResponse } from "next/server";
import { tossGet } from "@/lib/toss-api";
import axios from "axios";

export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.get("symbols");
  if (!symbols) return NextResponse.json({ error: "symbols required" }, { status: 400 });

  try {
    const data = await tossGet<unknown>("/api/v1/stocks", { symbols });
    const raw: unknown[] = Array.isArray(data) ? data : ((data as { result?: unknown[] }).result ?? []);

    const stocks = raw.map((s) => {
      const item = s as Record<string, unknown>;
      return {
        symbol: String(item.symbol ?? ""),
        name: String(item.name ?? item.symbolName ?? item.symbol ?? ""),
        currency: String(item.currency ?? "KRW"),
        marketCountry: String(item.marketCountry ?? "KR"),
        exchange: String(item.exchange ?? item.market ?? ""),
      };
    });

    return NextResponse.json({ stocks });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return NextResponse.json(e.response?.data ?? { error: e.message }, { status: e.response?.status ?? 500 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
