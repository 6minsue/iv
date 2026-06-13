import { NextRequest, NextResponse } from "next/server";
import { fetchCandlesServer } from "@/lib/server/candles";
import { optimize } from "@/lib/quant/optimize";
import { tossFeeProfile } from "@/lib/quant/fees";
import { PERIODS_PER_YEAR } from "@/lib/quant/types";
import type { StrategyId, BacktestConfig } from "@/lib/quant/types";
import axios from "axios";

interface Body {
  symbol: string;
  interval?: string;
  count?: number;
  strategy: StrategyId;
  config?: Partial<BacktestConfig>;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { symbol, strategy } = body;
  const interval = body.interval ?? "1d";
  const count = Math.min(Math.max(body.count ?? 200, 60), 200);
  if (!symbol || !strategy) return NextResponse.json({ error: "symbol, strategy required" }, { status: 400 });
  if (strategy === "ml" || strategy === "rl") {
    return NextResponse.json({ error: "그리드서치는 기술적 전략만 지원합니다" }, { status: 200 });
  }

  try {
    const bars = await fetchCandlesServer(symbol, interval, count);
    if (bars.length < 60) {
      return NextResponse.json({ error: "데이터 부족 (60봉 이상 필요)" }, { status: 200 });
    }

    const periodsPerYear = PERIODS_PER_YEAR[interval] ?? 252;
    const fee = tossFeeProfile(symbol);
    const cfg: Partial<BacktestConfig> = {
      commission: fee.commission,
      slippage: fee.slippage,
      sellTax: fee.sellTax,
      ...body.config,
      periodsPerYear,
    };

    const result = optimize(bars, strategy, cfg);
    return NextResponse.json({ symbol, interval, strategy, barCount: bars.length, feeLabel: fee.label, result });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return NextResponse.json(e.response?.data ?? { error: e.message }, { status: e.response?.status ?? 500 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
