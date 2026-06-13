import { NextRequest, NextResponse } from "next/server";
import { fetchCandlesServer } from "@/lib/server/candles";
import { computeComposite } from "@/lib/quant/signals";
import { atr } from "@/lib/quant/indicators";
import { KR_UNIVERSE, US_UNIVERSE, type UniverseItem } from "@/lib/quant/universe";

interface ScreenRow {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  score: number; // 종합 점수 (-100~100, 모멘텀+기술신호 블렌드)
  signalLabel: string;
  mom20: number;
  mom60: number;
  rsi: number | null;
  atrPct: number;
  trend: "상승" | "하락" | "횡보";
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  const market = (req.nextUrl.searchParams.get("market") ?? "KR").toUpperCase();
  const universe: UniverseItem[] = market === "US" ? US_UNIVERSE : KR_UNIVERSE;

  const rows: ScreenRow[] = [];
  for (const item of universe) {
    try {
      const bars = await fetchCandlesServer(item.symbol, "1d", 120);
      if (bars.length < 60) continue;
      const closes = bars.map((b) => b.close);
      const n = closes.length;
      const comp = computeComposite(item.symbol, bars);
      const mom20 = n > 20 ? closes[n - 1] / closes[n - 21] - 1 : 0;
      const mom60 = n > 60 ? closes[n - 1] / closes[n - 61] - 1 : 0;
      const atrV = atr(bars, 14)[n - 1];
      const atrPct = atrV != null ? (atrV as number) / closes[n - 1] : 0;
      const rsiInd = comp?.indicators.find((i) => i.key === "rsi");
      const rsiVal = rsiInd ? Number(rsiInd.value) : null;

      // 블렌드 점수: 기술 종합신호(50%) + 20일 모멘텀(30%) + 60일 모멘텀(20%)
      const compScore = comp?.score ?? 0;
      const score = Math.round(
        compScore * 0.5 + clamp(mom20 * 100, -40, 40) * 0.3 + clamp(mom60 * 100, -40, 40) * 0.2
      );
      const trend = mom20 > 0.05 ? "상승" : mom20 < -0.05 ? "하락" : "횡보";

      rows.push({
        symbol: item.symbol,
        name: item.name,
        sector: item.sector,
        price: closes[n - 1],
        score,
        signalLabel: comp?.label ?? "중립",
        mom20,
        mom60,
        rsi: rsiVal,
        atrPct,
        trend,
      });
    } catch {
      // 개별 실패(레이트리밋 등)는 건너뜀
    }
    await delay(350); // 레이트리밋 보호
  }

  rows.sort((a, b) => b.score - a.score);

  // 분산 추천: 점수 양수 종목에서 섹터당 최대 2개로 상위 6개 선별
  const sectorCount = new Map<string, number>();
  const diversified: ScreenRow[] = [];
  for (const r of rows) {
    if (r.score <= 0) continue;
    const c = sectorCount.get(r.sector) ?? 0;
    if (c >= 2) continue;
    sectorCount.set(r.sector, c + 1);
    diversified.push(r);
    if (diversified.length >= 6) break;
  }

  return NextResponse.json({ market, scanned: rows.length, rows, diversified });
}
