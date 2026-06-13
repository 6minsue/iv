import { NextRequest, NextResponse } from "next/server";
import { fetchCandlesServer } from "@/lib/server/candles";
import { generateSignals } from "@/lib/quant/strategies";
import { runBacktest } from "@/lib/quant/backtest";
import { runML, type MLConfig } from "@/lib/quant/ml";
import { PERIODS_PER_YEAR } from "@/lib/quant/types";
import type { Position, StrategyId, StrategyParams, BacktestConfig } from "@/lib/quant/types";
import axios from "axios";

interface BacktestBody {
  symbol: string;
  interval?: string;
  count?: number;
  strategy: StrategyId;
  params?: StrategyParams;
  config?: Partial<BacktestConfig>;
  ml?: Partial<MLConfig>;
}

export async function POST(req: NextRequest) {
  let body: BacktestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { symbol, strategy } = body;
  const interval = body.interval ?? "1d";
  const count = Math.min(Math.max(body.count ?? 200, 60), 200);
  if (!symbol || !strategy) return NextResponse.json({ error: "symbol, strategy required" }, { status: 400 });

  try {
    const bars = await fetchCandlesServer(symbol, interval, count);
    if (bars.length < 60) {
      return NextResponse.json({ error: "백테스트에 필요한 데이터가 부족합니다 (60봉 이상 필요)" }, { status: 200 });
    }

    const periodsPerYear = PERIODS_PER_YEAR[interval] ?? 252;
    // 사용자 config를 먼저 펼치고, 인터벌 기반 periodsPerYear로 덮어쓴다
    const cfg: Partial<BacktestConfig> = { ...body.config, periodsPerYear };

    let signals: Position[];
    let startIndex = 0;
    let mlInfo: ReturnType<typeof runML> | null = null;

    if (strategy === "ml") {
      mlInfo = runML(bars, body.ml);
      signals = mlInfo.signals;
      startIndex = mlInfo.trainEndIndex; // 아웃오브샘플 구간만 평가
    } else {
      signals = generateSignals(bars, strategy, body.params ?? {});
    }

    const result = runBacktest(bars, signals, cfg, startIndex);

    return NextResponse.json({
      symbol,
      interval,
      strategy,
      barCount: bars.length,
      result,
      ml: mlInfo
        ? {
            trainEndIndex: mlInfo.trainEndIndex,
            trainEndTime: bars[mlInfo.trainEndIndex]?.time ?? null,
            featureNames: mlInfo.featureNames,
            importance: mlInfo.importance,
            metrics: mlInfo.metrics,
          }
        : null,
    });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return NextResponse.json(e.response?.data ?? { error: e.message }, { status: e.response?.status ?? 500 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
