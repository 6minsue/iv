import { NextRequest, NextResponse } from "next/server";
import { fetchCandlesServer } from "@/lib/server/candles";
import { walkForward, type WalkForwardConfig } from "@/lib/quant/walkforward";
import { tossFeeProfile } from "@/lib/quant/fees";
import { PERIODS_PER_YEAR } from "@/lib/quant/types";
import type { StrategyId, StrategyParams, BacktestConfig } from "@/lib/quant/types";
import type { MLConfig } from "@/lib/quant/ml";
import type { RLConfig } from "@/lib/quant/rl";
import axios from "axios";

interface Body {
  symbol: string;
  interval?: string;
  count?: number;
  strategy: StrategyId;
  params?: StrategyParams;
  ml?: Partial<MLConfig>;
  rl?: Partial<RLConfig>;
  config?: Partial<BacktestConfig>;
  wf?: Partial<WalkForwardConfig>;
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
  const count = Math.min(Math.max(body.count ?? 250, 60), 500);
  if (!symbol || !strategy) return NextResponse.json({ error: "symbol, strategy required" }, { status: 400 });

  try {
    const bars = await fetchCandlesServer(symbol, interval, count);
    if (bars.length < 80) {
      return NextResponse.json({ error: "워크포워드에 필요한 데이터가 부족합니다 (80봉 이상)" }, { status: 200 });
    }

    const periodsPerYear = PERIODS_PER_YEAR[interval] ?? 252;
    const fee = tossFeeProfile(symbol);
    const cfg: Partial<BacktestConfig> = {
      initialCapital: 10_000_000,
      commission: fee.commission,
      slippage: fee.slippage,
      sellTax: fee.sellTax,
      allowShort: false,
      ...body.config,
      periodsPerYear,
    };

    const wf: WalkForwardConfig = {
      trainBars: Math.min(body.wf?.trainBars ?? 120, bars.length - 20),
      testBars: body.wf?.testBars ?? 10,
      anchored: body.wf?.anchored ?? false,
    };

    const result = walkForward(
      bars,
      { strategy, params: body.params, ml: body.ml, rl: body.rl },
      cfg,
      wf
    );

    return NextResponse.json({ symbol, interval, strategy, barCount: bars.length, feeLabel: fee.label, wf, result });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return NextResponse.json(e.response?.data ?? { error: e.message }, { status: e.response?.status ?? 500 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
