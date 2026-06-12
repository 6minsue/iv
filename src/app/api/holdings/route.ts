import { NextRequest, NextResponse } from "next/server";
import { tossGet } from "@/lib/toss-api";
import axios from "axios";

interface TossHoldingItem {
  symbol: string;
  name: string;
  marketCountry: string;
  currency: string;
  quantity: string;
  lastPrice: string;
  averagePurchasePrice: string;
  marketValue: { purchaseAmount: string; amount: string; amountAfterCost: string };
  profitLoss: { amount: string; amountAfterCost: string; rate: string; rateAfterCost: string };
  dailyProfitLoss: { amount: string; rate: string };
  cost: { commission: string; tax: string | null };
}

interface TossSummary {
  totalPurchaseAmount: { krw: string; usd: string };
  marketValue: { amount: { krw: string; usd: string }; amountAfterCost: { krw: string; usd: string } };
  profitLoss: { amount: { krw: string; usd: string }; amountAfterCost: { krw: string; usd: string }; rate: string; rateAfterCost: string };
  dailyProfitLoss: { amount: { krw: string; usd: string }; rate: string };
  items: TossHoldingItem[];
}

export async function GET(req: NextRequest) {
  const accountSeq = req.nextUrl.searchParams.get("accountSeq");
  if (!accountSeq) return NextResponse.json({ error: "accountSeq required" }, { status: 400 });

  try {
    // 환율 병렬 조회
    const [holdingsData, rateData] = await Promise.all([
      tossGet<{ result: TossSummary }>("/api/v1/holdings", {}, accountSeq),
      tossGet<{ result: { rate: string } }>("/api/v1/exchange-rate", {
        baseCurrency: "USD",
        quoteCurrency: "KRW",
      }).catch(() => ({ result: { rate: "1400" } })),
    ]);

    const raw = (holdingsData as { result: TossSummary }).result;
    const exchangeRate = Number((rateData as { result: { rate: string } }).result?.rate ?? 1400);

    // 보유종목 정규화
    const holdings = (raw?.items ?? []).map((item: TossHoldingItem) => {
      const isUSD = item.currency === "USD";
      const qty = Number(item.quantity);
      const lastPrice = Number(item.lastPrice);
      const avgPrice = Number(item.averagePurchasePrice ?? 0);
      const marketValueNative = Number(item.marketValue?.amount ?? lastPrice * qty);
      const purchaseAmountNative = Number(item.marketValue?.purchaseAmount ?? avgPrice * qty);
      const profitLossNative = Number(item.profitLoss?.amount ?? 0);
      // rate는 비율 (1.5887 = 158.87%)
      const profitLossRate = Number(item.profitLoss?.rate ?? 0) * 100;
      const dailyPnlNative = Number(item.dailyProfitLoss?.amount ?? 0);
      const dailyPnlRate = Number(item.dailyProfitLoss?.rate ?? 0) * 100;
      const commission = Number(item.cost?.commission ?? 0);

      const marketValueKRW = isUSD ? marketValueNative * exchangeRate : marketValueNative;
      const purchaseAmountKRW = isUSD ? purchaseAmountNative * exchangeRate : purchaseAmountNative;
      const profitLossKRW = isUSD ? profitLossNative * exchangeRate : profitLossNative;

      return {
        symbol: item.symbol,
        symbolName: item.name,
        currency: item.currency,
        marketCountry: item.marketCountry,
        quantity: qty,
        lastPrice,
        averagePrice: avgPrice,
        marketValueNative,
        purchaseAmountNative,
        profitLossNative,
        profitLossRate,
        dailyPnlNative,
        dailyPnlRate,
        commission,
        // KRW 환산값
        marketValueKRW,
        purchaseAmountKRW,
        profitLossKRW,
        exchangeRate: isUSD ? exchangeRate : 1,
      };
    });

    // 포트폴리오 요약
    const krwMarketValue = Number(raw?.marketValue?.amount?.krw ?? 0);
    const usdMarketValue = Number(raw?.marketValue?.amount?.usd ?? 0);
    const krwPurchase = Number(raw?.totalPurchaseAmount?.krw ?? 0);
    const usdPurchase = Number(raw?.totalPurchaseAmount?.usd ?? 0);
    const krwPnl = Number(raw?.profitLoss?.amount?.krw ?? 0);
    const usdPnl = Number(raw?.profitLoss?.amount?.usd ?? 0);
    const totalPnlRate = Number(raw?.profitLoss?.rate ?? 0) * 100;
    const krwDailyPnl = Number(raw?.dailyProfitLoss?.amount?.krw ?? 0);
    const usdDailyPnl = Number(raw?.dailyProfitLoss?.amount?.usd ?? 0);
    const dailyPnlRate = Number(raw?.dailyProfitLoss?.rate ?? 0) * 100;

    // 평균 매입 환율 = 원화 매입 총액 / 달러 매입 총액
    const avgPurchaseRate = usdPurchase > 0 ? krwPurchase / usdPurchase : 0;
    // 환율 손익 = 현재 환율 변화로 인한 평가금액 변동 (달러 포지션 기준)
    const fxPnl = usdPurchase > 0
      ? usdMarketValue * (exchangeRate - avgPurchaseRate)
      : 0;
    const fxPnlRate = avgPurchaseRate > 0
      ? ((exchangeRate - avgPurchaseRate) / avgPurchaseRate) * 100
      : 0;

    const summary = {
      exchangeRate,
      avgPurchaseRate,
      fxPnl,
      fxPnlRate,
      // 한국주식
      krwMarketValue,
      krwPurchase,
      krwPnl,
      // 미국주식 (달러)
      usdMarketValue,
      usdPurchase,
      usdPnl,
      // 달러→원 환산
      usdMarketValueKRW: usdMarketValue * exchangeRate,
      usdPurchaseKRW: usdPurchase * exchangeRate,
      usdPnlKRW: usdPnl * exchangeRate,
      // 전체 합산 (원화)
      totalMarketValueKRW: krwMarketValue + usdMarketValue * exchangeRate,
      totalPurchaseKRW: krwPurchase + usdPurchase * exchangeRate,
      totalPnlKRW: krwPnl + usdPnl * exchangeRate,
      totalPnlRate,
      // 일별 손익
      krwDailyPnl,
      usdDailyPnl,
      usdDailyPnlKRW: usdDailyPnl * exchangeRate,
      dailyPnlRate,
    };

    return NextResponse.json({ summary, holdings });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      console.error("[holdings]", e.response?.status, JSON.stringify(e.response?.data));
      return NextResponse.json(e.response?.data ?? { error: e.message }, { status: e.response?.status ?? 500 });
    }
    console.error("[holdings]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
