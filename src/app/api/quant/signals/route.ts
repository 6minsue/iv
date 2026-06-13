import { NextRequest, NextResponse } from "next/server";
import { fetchCandlesServer } from "@/lib/server/candles";
import { computeComposite } from "@/lib/quant/signals";
import { rsi, macd, bollinger, sma } from "@/lib/quant/indicators";
import axios from "axios";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol = searchParams.get("symbol");
  const interval = searchParams.get("interval") ?? "1d";
  const count = Number(searchParams.get("count") ?? 200);
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  try {
    const bars = await fetchCandlesServer(symbol, interval, count);
    if (bars.length < 60) {
      return NextResponse.json({ error: "데이터 부족", composite: null, series: [] }, { status: 200 });
    }

    const composite = computeComposite(symbol, bars);
    const closes = bars.map((b) => b.close);
    const rsiArr = rsi(closes, 14);
    const macdR = macd(closes);
    const bb = bollinger(closes, 20, 2);
    const sma20 = sma(closes, 20);
    const sma60 = sma(closes, 60);

    // 차트용 최근 시계열 (최대 120봉)
    const start = Math.max(0, bars.length - 120);
    const series = bars.slice(start).map((b, idx) => {
      const i = start + idx;
      return {
        time: b.time,
        close: b.close,
        sma20: sma20[i],
        sma60: sma60[i],
        upper: bb.upper[i],
        lower: bb.lower[i],
        rsi: rsiArr[i],
        macdHist: macdR.histogram[i],
        macd: macdR.macd[i],
        signal: macdR.signal[i],
      };
    });

    return NextResponse.json({ symbol, interval, composite, series });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return NextResponse.json(e.response?.data ?? { error: e.message }, { status: e.response?.status ?? 500 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
