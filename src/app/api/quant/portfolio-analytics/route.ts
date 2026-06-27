import { NextRequest, NextResponse } from "next/server";
import { fetchCandlesServer } from "@/lib/server/candles";
import { computeRisk, monteCarlo, dailyReturns } from "@/lib/quant/risk";
import { computeMPT } from "@/lib/quant/mpt";
import axios from "axios";

interface HoldingIn {
  symbol: string;
  quantity: number;
  currency: string;
}
interface Body {
  holdings: HoldingIn[];
  exchangeRate?: number;
  count?: number;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const holdings = (body.holdings ?? []).filter((h) => h.symbol && h.quantity > 0).slice(0, 20);
  const exchangeRate = Number(body.exchangeRate ?? 1400);
  const count = Math.min(Math.max(body.count ?? 180, 60), 400);
  if (holdings.length === 0) return NextResponse.json({ error: "보유 종목이 없습니다" }, { status: 200 });

  try {
    // 종목별 일봉 수집 (캐시 + 페이지네이션). USD 종목은 환율 상수 적용.
    const series: { h: HoldingIn; closeByDate: Map<string, number>; dates: string[] }[] = [];
    for (const h of holdings) {
      try {
        const bars = await fetchCandlesServer(h.symbol, "1d", count);
        if (bars.length < 20) continue;
        const m = new Map<string, number>();
        for (const b of bars) m.set(b.time.slice(0, 10), b.close);
        series.push({ h, closeByDate: m, dates: [...m.keys()].sort() });
      } catch {
        // 개별 실패는 건너뜀
      }
    }
    if (series.length === 0) return NextResponse.json({ error: "가격 데이터를 불러올 수 없습니다" }, { status: 200 });

    // 공통 시작일 = 각 종목 최초일의 최댓값 (모든 종목 데이터 존재 보장)
    const startDate = series.map((s) => s.dates[0]).sort().reverse()[0];
    const allDates = [...new Set(series.flatMap((s) => s.dates))].sort();

    const fx = (h: HoldingIn) => (h.currency === "USD" ? exchangeRate : 1);
    const lastClose = new Map<string, number>();
    const history: { date: string; value: number }[] = [];
    // 자산별 종가 시계열 (MPT 상관/공분산용, history와 동일 정렬)
    const assetCloses = new Map<string, number[]>(series.map((s) => [s.h.symbol, []]));

    for (const date of allDates) {
      for (const s of series) {
        const c = s.closeByDate.get(date);
        if (c != null) lastClose.set(s.h.symbol, c);
      }
      if (date < startDate) continue;
      let value = 0;
      let complete = true;
      for (const s of series) {
        const c = lastClose.get(s.h.symbol);
        if (c == null) { complete = false; break; }
        value += s.h.quantity * c * fx(s.h);
      }
      if (complete) {
        history.push({ date, value });
        for (const s of series) assetCloses.get(s.h.symbol)!.push(lastClose.get(s.h.symbol) as number);
      }
    }

    if (history.length < 10) return NextResponse.json({ error: "분석에 필요한 히스토리가 부족합니다" }, { status: 200 });

    const values = history.map((p) => p.value);
    const metrics = computeRisk(values, 252);
    const mc = monteCarlo(values, 30, 2500);

    // 일별수익률 분포 히스토그램 (VaR 시각화용)
    const rets = dailyReturns(values);
    let returnHist: { ret: number; count: number }[] = [];
    if (rets.length >= 10) {
      const lo = Math.min(...rets), hi = Math.max(...rets);
      const bins = 21;
      const width = (hi - lo) / bins || 1;
      const counts = Array(bins).fill(0);
      for (const r of rets) counts[Math.min(bins - 1, Math.max(0, Math.floor((r - lo) / width)))]++;
      returnHist = counts.map((count, i) => ({ ret: Number(((lo + (i + 0.5) * width) * 100).toFixed(2)), count }));
    }

    // 벤치마크 대비 CAPM (KOSPI200 = KODEX 200 ETF 069500)
    let benchmark: {
      beta: number; alpha: number; correlation: number; r2: number; trackingError: number; totalReturn: number;
      series: { date: string; value: number }[];
    } | null = null;
    try {
      const bb = await fetchCandlesServer("069500", "1d", 400);
      if (bb.length >= 20) {
        // 벤치마크 타임라인 기준 forward-fill (history의 US-only 거래일도 직전 종가 유지)
        const bMap = new Map(bb.map((b) => [b.time.slice(0, 10), b.close]));
        const bDates = bb.map((b) => b.time.slice(0, 10)).sort();
        let ptr = 0;
        let lastB: number | null = null;
        const bSeries: number[] = [];
        let ok = true;
        for (const p of history) {
          while (ptr < bDates.length && bDates[ptr] <= p.date) { lastB = bMap.get(bDates[ptr]) as number; ptr++; }
          if (lastB == null) { ok = false; break; }
          bSeries.push(lastB);
        }
        if (ok && bSeries.length === values.length && bSeries[0] > 0) {
          const pr = rets;
          const br = dailyReturns(bSeries);
          const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
          const mp = mean(pr), mb = mean(br);
          let covPB = 0, varB = 0, varP = 0, teSum = 0;
          for (let i = 0; i < pr.length; i++) {
            covPB += (pr[i] - mp) * (br[i] - mb);
            varB += (br[i] - mb) ** 2;
            varP += (pr[i] - mp) ** 2;
            teSum += (pr[i] - br[i]) ** 2;
          }
          covPB /= pr.length; varB /= pr.length; varP /= pr.length;
          const beta = varB > 0 ? covPB / varB : 0;
          const stdP = Math.sqrt(varP), stdB = Math.sqrt(varB);
          const corr = stdP > 0 && stdB > 0 ? covPB / (stdP * stdB) : 0;
          const scale = values[0] / bSeries[0];
          benchmark = {
            beta,
            alpha: (mp - beta * mb) * 252,
            correlation: corr,
            r2: corr * corr,
            trackingError: Math.sqrt(teSum / pr.length) * Math.sqrt(252),
            totalReturn: bSeries[bSeries.length - 1] / bSeries[0] - 1,
            series: history.map((p, i) => ({ date: p.date, value: bSeries[i] * scale })),
          };
        }
      }
    } catch { /* 벤치마크 실패는 무시 */ }

    // 현재 자산배분
    const currentValue = values[values.length - 1];
    const allocation = series
      .map((s) => {
        const last = s.closeByDate.get(s.dates[s.dates.length - 1]) ?? 0;
        const v = s.h.quantity * last * fx(s.h);
        return { symbol: s.h.symbol, value: v, weight: currentValue > 0 ? v / currentValue : 0, currency: s.h.currency };
      })
      .sort((a, b) => b.value - a.value);

    // 현대 포트폴리오 이론 (효율적 투자선 + 최적배분 + 상관관계)
    const symbols = series.map((s) => s.h.symbol);
    const retMatrix = symbols.map((sym) => dailyReturns(assetCloses.get(sym) ?? []));
    const currentWeights = series.map((s) => {
      const last = s.closeByDate.get(s.dates[s.dates.length - 1]) ?? 0;
      return currentValue > 0 ? (s.h.quantity * last * fx(s.h)) / currentValue : 0;
    });
    const mpt = symbols.length >= 2 ? computeMPT(symbols, retMatrix, currentWeights, 4000) : null;

    return NextResponse.json({
      currentValue,
      observations: history.length,
      history,
      metrics,
      monteCarlo: mc,
      allocation,
      mpt,
      returnHist,
      benchmark,
    });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      return NextResponse.json(e.response?.data ?? { error: e.message }, { status: e.response?.status ?? 500 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
