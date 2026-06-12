import { NextRequest, NextResponse } from "next/server";
import { tossGet } from "@/lib/toss-api";
import axios from "axios";

interface TossOrderEntry {
  price?: string;
  volume?: string;
  quantity?: string;
  askPrice?: string;
  bidPrice?: string;
  askQuantity?: string;
  bidQuantity?: string;
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  try {
    const data = await tossGet<unknown>("/api/v1/orderbook", { symbol });
    const resultData = (data as { result?: unknown }).result ?? data;
    const r = resultData as { asks?: TossOrderEntry[]; bids?: TossOrderEntry[] };

    return NextResponse.json({
      asks: (r.asks ?? []).map((a) => ({
        price: Number(a.price ?? a.askPrice ?? 0),
        quantity: Number(a.volume ?? a.quantity ?? a.askQuantity ?? 0),
      })),
      bids: (r.bids ?? []).map((b) => ({
        price: Number(b.price ?? b.bidPrice ?? 0),
        quantity: Number(b.volume ?? b.quantity ?? b.bidQuantity ?? 0),
      })),
    });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return NextResponse.json(e.response?.data ?? { error: e.message }, { status: e.response?.status ?? 500 });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
