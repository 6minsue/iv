import { NextResponse } from "next/server";
import { tossGet } from "@/lib/toss-api";
import axios from "axios";

interface TossAccount {
  accountSeq: number;
  accountNo?: string;
  accountName?: string;
  accountType?: string;
}

export async function GET() {
  try {
    const data = await tossGet<unknown>("/api/v1/accounts");
    const raw: TossAccount[] = Array.isArray(data)
      ? data
      : (data as { result?: TossAccount[] }).result ?? [];

    const accounts = raw.map((a) => ({
      accountSeq: String(a.accountSeq),
      accountName: a.accountName ?? `${a.accountType ?? "계좌"} (${a.accountNo ?? a.accountSeq})`,
      accountType: a.accountType ?? "BROKERAGE",
    }));

    return NextResponse.json({ accounts });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return NextResponse.json(e.response?.data ?? { error: e.message }, { status: e.response?.status ?? 500 });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
