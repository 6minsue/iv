import { NextRequest, NextResponse } from "next/server";
import { fetchCandlesServer } from "@/lib/server/candles";
import { autoQuant } from "@/lib/quant/autoquant";
import { runBacktest } from "@/lib/quant/backtest";
import { analyzeStrategy } from "@/lib/quant/insights";
import { tossFeeProfile } from "@/lib/quant/fees";
import { tossGet } from "@/lib/toss-api";
import { PERIODS_PER_YEAR } from "@/lib/quant/types";
import type { BacktestConfig } from "@/lib/quant/types";
import axios from "axios";

interface Body {
  symbol: string;
  interval?: string;
  count?: number;
  budgetKRW?: number;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { symbol } = body;
  const interval = body.interval ?? "1d";
  const count = Math.min(Math.max(body.count ?? 300, 80), 500);
  const budgetKRW = Math.max(body.budgetKRW ?? 1_000_000, 10_000);
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  try {
    const isUS = !/^\d{6}$/.test(symbol);
    const [bars, exchangeRate] = await Promise.all([
      fetchCandlesServer(symbol, interval, count),
      isUS
        ? tossGet<{ result: { rate: string } }>("/api/v1/exchange-rate", { baseCurrency: "USD", quoteCurrency: "KRW" })
            .then((d) => Number(d.result?.rate ?? 1400))
            .catch(() => 1400)
        : Promise.resolve(1),
    ]);

    if (bars.length < 80) {
      return NextResponse.json({ error: "오토퀀트에 필요한 데이터가 부족합니다 (80봉 이상)" }, { status: 200 });
    }

    const periodsPerYear = PERIODS_PER_YEAR[interval] ?? 252;
    const fee = tossFeeProfile(symbol);
    const cfg: Partial<BacktestConfig> = {
      initialCapital: 10_000_000,
      commission: fee.commission,
      slippage: fee.slippage,
      sellTax: fee.sellTax,
      periodsPerYear,
    };

    const auto = autoQuant(bars, cfg);
    const result = runBacktest(bars, auto.ensembleSignals, cfg, auto.trainEndIndex);
    const analysis = analyzeStrategy(bars, auto.ensembleSignals, result.trades, { isUS, exchangeRate, budgetKRW });

    return NextResponse.json({
      symbol,
      isUS,
      interval,
      price: bars[bars.length - 1].close,
      exchangeRate,
      feeLabel: fee.label,
      barCount: bars.length,
      auto: {
        trainEndTime: auto.trainEndTime,
        candidates: auto.candidates,
        ensembleMembers: auto.ensembleMembers,
        agreement: auto.agreement,
        selectedCount: auto.selectedCount,
        lowConfidence: auto.lowConfidence,
      },
      result,
      analysis,
    });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return NextResponse.json(e.response?.data ?? { error: e.message }, { status: e.response?.status ?? 500 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
