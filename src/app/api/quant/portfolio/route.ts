import { NextRequest, NextResponse } from "next/server";
import { fetchCandlesServer } from "@/lib/server/candles";
import { portfolioBacktest, type SymbolSeries } from "@/lib/quant/portfolio";
import { tossFeeProfile } from "@/lib/quant/fees";
import { PERIODS_PER_YEAR } from "@/lib/quant/types";
import type { StrategyId, StrategyParams, BacktestConfig } from "@/lib/quant/types";
import axios from "axios";

interface Body {
  symbols: string[];
  interval?: string;
  count?: number;
  strategy: StrategyId;
  params?: StrategyParams;
  config?: Partial<BacktestConfig>;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const symbols = (body.symbols ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 12);
  const strategy = body.strategy;
  const interval = body.interval ?? "1d";
  const count = Math.min(Math.max(body.count ?? 200, 60), 200);
  if (symbols.length < 2 || !strategy) {
    return NextResponse.json({ error: "symbols(2개 이상), strategy required" }, { status: 400 });
  }
  if (strategy === "ml" || strategy === "rl") {
    return NextResponse.json({ error: "포트폴리오 백테스트는 기술적 전략만 지원합니다" }, { status: 200 });
  }

  try {
    // 레이트리밋 보호: 순차 fetch (캔들 캐시 활용)
    const series: SymbolSeries[] = [];
    for (const symbol of symbols) {
      try {
        const bars = await fetchCandlesServer(symbol, interval, count);
        if (bars.length >= 30) series.push({ symbol, bars });
      } catch {
        // 개별 종목 실패는 건너뜀
      }
    }
    if (series.length < 2) {
      return NextResponse.json({ error: "유효한 종목이 2개 미만입니다" }, { status: 200 });
    }

    const periodsPerYear = PERIODS_PER_YEAR[interval] ?? 252;
    // 포트폴리오는 종목 통화가 섞일 수 있어 미국 기준 수수료 사용
    const fee = tossFeeProfile(symbols[0]);
    const cfg: Partial<BacktestConfig> = {
      initialCapital: 10_000_000,
      commission: fee.commission,
      slippage: fee.slippage,
      sellTax: fee.sellTax,
      ...body.config,
      periodsPerYear,
    };

    const result = portfolioBacktest(series, strategy, body.params ?? {}, cfg, periodsPerYear);
    return NextResponse.json({
      symbols: series.map((s) => s.symbol),
      interval,
      strategy,
      result,
    });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return NextResponse.json(e.response?.data ?? { error: e.message }, { status: e.response?.status ?? 500 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
