import { NextRequest, NextResponse } from "next/server";
import { fetchCandlesServer } from "@/lib/server/candles";
import { generateSignals } from "@/lib/quant/strategies";
import { runBacktest } from "@/lib/quant/backtest";
import { runML, type MLConfig } from "@/lib/quant/ml";
import { runRL, type RLConfig } from "@/lib/quant/rl";
import { analyzeStrategy } from "@/lib/quant/insights";
import { tossFeeProfile } from "@/lib/quant/fees";
import { tossGet } from "@/lib/toss-api";
import { PERIODS_PER_YEAR } from "@/lib/quant/types";
import type { Position, StrategyId, StrategyParams, BacktestConfig } from "@/lib/quant/types";
import axios from "axios";

interface Body {
  symbol: string;
  interval?: string;
  count?: number;
  strategy: StrategyId;
  params?: StrategyParams;
  ml?: Partial<MLConfig>;
  rl?: Partial<RLConfig>;
  budgetKRW?: number;
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
  const budgetKRW = Math.max(body.budgetKRW ?? 1_000_000, 10_000);
  if (!symbol || !strategy) return NextResponse.json({ error: "symbol, strategy required" }, { status: 400 });

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

    if (bars.length < 60) {
      return NextResponse.json({ error: "데이터 부족 (60봉 이상 필요)" }, { status: 200 });
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

    let signals: Position[];
    let startIndex = 0;
    let mlInfo: ReturnType<typeof runML> | null = null;
    let rlInfo: ReturnType<typeof runRL> | null = null;

    if (strategy === "ml") {
      mlInfo = runML(bars, body.ml);
      signals = mlInfo.signals;
      startIndex = mlInfo.trainEndIndex;
    } else if (strategy === "rl") {
      rlInfo = runRL(bars, body.rl);
      signals = rlInfo.signals;
      startIndex = rlInfo.trainEndIndex;
    } else {
      signals = generateSignals(bars, strategy, body.params ?? {});
    }

    const result = runBacktest(bars, signals, cfg, startIndex);
    const analysis = analyzeStrategy(bars, signals, result.trades, {
      isUS,
      exchangeRate,
      budgetKRW,
    });

    return NextResponse.json({
      symbol,
      isUS,
      interval,
      strategy,
      price: bars[bars.length - 1].close,
      exchangeRate,
      feeLabel: fee.label,
      barCount: bars.length,
      result,
      analysis,
      ml: mlInfo ? { metrics: mlInfo.metrics, trainEndTime: bars[mlInfo.trainEndIndex]?.time ?? null } : null,
      rl: rlInfo ? { metrics: rlInfo.metrics, trainEndTime: bars[rlInfo.trainEndIndex]?.time ?? null } : null,
    });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return NextResponse.json(e.response?.data ?? { error: e.message }, { status: e.response?.status ?? 500 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
