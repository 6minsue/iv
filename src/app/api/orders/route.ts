import { NextRequest, NextResponse } from "next/server";
import { tossGet, tossPost } from "@/lib/toss-api";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const accountSeq = searchParams.get("accountSeq");
  if (!accountSeq) return NextResponse.json({ error: "accountSeq required" }, { status: 400 });

  const params: Record<string, string | number> = {
    status: searchParams.get("status") ?? "OPEN",
    limit: 20,
  };
  if (searchParams.get("symbol")) params.symbol = searchParams.get("symbol")!;

  try {
    const data = await tossGet("/api/v1/orders", params, accountSeq);
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { accountSeq, ...orderBody } = body;
  if (!accountSeq) return NextResponse.json({ error: "accountSeq required" }, { status: 400 });

  try {
    const data = await tossPost("/api/v1/orders", orderBody, accountSeq);
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
