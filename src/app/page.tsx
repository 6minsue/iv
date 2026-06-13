"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import PriceCard from "@/components/PriceCard";
import { useAppStore } from "@/store/useAppStore";
import { extractArray } from "@/lib/parse";
import { formatNumber } from "@/lib/utils";
import { TrendingUp, TrendingDown, Activity, Wallet, Briefcase, ArrowUp, ArrowDown, Atom, ArrowRight } from "lucide-react";
import Link from "next/link";

interface PriceData {
  symbol: string;
  symbolName: string;
  currentPrice: number;
  changePrice: number;
  changeRate: number;
  volume: number;
}

interface HoldingRow {
  symbol: string;
  symbolName: string;
  currency: string;
  quantity: number;
  lastPrice: number;
  averagePrice: number;
  marketValueNative: number;
  marketValueKRW: number;
  profitLossNative: number;
  profitLossKRW: number;
  profitLossRate: number;
  exchangeRate: number;
}

interface Summary {
  exchangeRate: number;
  krwMarketValue: number;
  usdMarketValue: number;
  usdMarketValueKRW: number;
  totalMarketValueKRW: number;
  totalPurchaseKRW: number;
  totalPnlKRW: number;
  totalPnlRate: number;
  usdDailyPnlKRW: number;
  krwDailyPnl: number;
  dailyPnlRate: number;
}

export default function DashboardPage() {
  const { watchlist, selectedAccount } = useAppStore();
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  const pollingRef = useRef<number | null>(null);

  useEffect(() => {
    if (watchlist.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingPrices(true);
    fetch(`/api/prices?symbols=${watchlist.join(",")}`)
      .then((r) => r.json())
      .then((d) => setPrices(extractArray<PriceData>(d, "prices", "data", "items")))
      .catch(() => setPrices([]))
      .finally(() => setLoadingPrices(false));
  }, [watchlist]);

  // 실시간 가격 업데이트 (백그라운드, 15초)
  useEffect(() => {
    if (watchlist.length === 0) return;
    if (pollingRef.current) window.clearInterval(pollingRef.current);
    pollingRef.current = window.setInterval(() => {
      fetch(`/api/prices?symbols=${watchlist.join(",")}&fast=1`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { prices?: Array<{ symbol: string; currentPrice: number }> } | null) => {
          if (!d) return;
          const list = extractArray<{ symbol: string; currentPrice: number }>(d, "prices");
          if (list.length === 0) return;
          const map = Object.fromEntries(list.map((p) => [p.symbol, p.currentPrice]));
          setPrices((prev) => prev.map((p) => (map[p.symbol] !== undefined ? { ...p, currentPrice: map[p.symbol] } : p)));
        })
        .catch(() => {});
    }, 15000);
    return () => { if (pollingRef.current) window.clearInterval(pollingRef.current); };
  }, [watchlist]);

  useEffect(() => {
    if (!selectedAccount) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingHoldings(true);
    fetch(`/api/holdings?accountSeq=${selectedAccount.accountSeq}`)
      .then((r) => r.json())
      .then((d) => {
        setHoldings(d.holdings ?? []);
        setSummary(d.summary ?? null);
      })
      .catch(() => { setHoldings([]); setSummary(null); })
      .finally(() => setLoadingHoldings(false));
  }, [selectedAccount]);

  const winners = prices.filter((p) => (p.changePrice ?? 0) > 0).length;
  const losers = prices.filter((p) => (p.changePrice ?? 0) < 0).length;

  const totalKRW = summary?.totalMarketValueKRW ?? 0;
  const totalPnl = summary?.totalPnlKRW ?? 0;
  const totalPnlRate = summary?.totalPnlRate ?? 0;
  const dailyPnl = (summary?.usdDailyPnlKRW ?? 0) + (summary?.krwDailyPnl ?? 0);

  return (
    <div className="min-h-screen">
      <Header title="대시보드" />
      <div className="p-6 space-y-7 max-w-7xl mx-auto w-full">

        {/* 리서치 랩 배너 */}
        <Link href="/lab" className="block panel p-4 relative overflow-hidden group hover:border-violet-400/40 transition-colors">
          <div className="absolute -top-12 -right-8 w-52 h-52 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="flex items-center justify-between relative">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center glow">
                <Atom className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">리서치 랩 — 매수·매도·수량 추천 + 백테스트</p>
                <p className="text-xs text-[var(--text-dim)]">워크포워드 · 강화학습 · 과적합검증(PBO/DSR) · 포트폴리오</p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-[var(--text-mute)] group-hover:text-violet-300 group-hover:translate-x-0.5 transition-all" />
          </div>
        </Link>

        {/* 요약 카드 */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="panel p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-violet-500/10"><Wallet className="w-4 h-4 text-violet-300" /></div>
              <span className="text-xs text-[var(--text-dim)] font-medium">총 평가금액</span>
            </div>
            <p className="text-xl font-bold tabular-nums text-violet-300">
              {totalKRW > 0 ? `${formatNumber(Math.round(totalKRW))}원` : loadingHoldings ? "로딩중…" : "—"}
            </p>
            <p className="text-xs text-[var(--text-mute)] mt-1">
              {summary ? `환율 ₩${formatNumber(summary.exchangeRate, 1)}` : selectedAccount?.accountName ?? "계좌 없음"}
            </p>
          </div>

          <div className={`panel p-4 ${totalPnl >= 0 ? "border-rose-500/20" : "border-blue-500/20"}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`p-2 rounded-lg ${totalPnl >= 0 ? "bg-rose-500/10" : "bg-blue-500/10"}`}>
                {totalPnl >= 0 ? <TrendingUp className="w-4 h-4 text-rose-400" /> : <TrendingDown className="w-4 h-4 text-blue-400" />}
              </div>
              <span className="text-xs text-[var(--text-dim)] font-medium">누적 손익</span>
            </div>
            <p className={`text-xl font-bold tabular-nums ${totalPnl >= 0 ? "text-rose-400" : "text-blue-400"}`}>
              {totalKRW > 0 ? `${totalPnl >= 0 ? "+" : ""}${formatNumber(Math.round(totalPnl))}원` : "—"}
            </p>
            <p className="text-xs text-[var(--text-mute)] mt-1">
              {totalPnlRate !== 0 ? `${totalPnlRate >= 0 ? "+" : ""}${totalPnlRate.toFixed(2)}%` : "—"}
            </p>
          </div>

          <div className={`panel p-4 ${dailyPnl >= 0 ? "border-orange-500/20" : "border-indigo-500/20"}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`p-2 rounded-lg ${dailyPnl >= 0 ? "bg-orange-500/10" : "bg-indigo-500/10"}`}>
                {dailyPnl >= 0 ? <ArrowUp className="w-4 h-4 text-orange-400" /> : <ArrowDown className="w-4 h-4 text-indigo-400" />}
              </div>
              <span className="text-xs text-[var(--text-dim)] font-medium">일 손익</span>
            </div>
            <p className={`text-xl font-bold tabular-nums ${dailyPnl >= 0 ? "text-orange-400" : "text-indigo-400"}`}>
              {totalKRW > 0 ? `${dailyPnl >= 0 ? "+" : ""}${formatNumber(Math.round(dailyPnl))}원` : "—"}
            </p>
            <p className="text-xs text-[var(--text-mute)] mt-1">
              {summary && summary.dailyPnlRate !== 0 ? `${summary.dailyPnlRate >= 0 ? "+" : ""}${summary.dailyPnlRate.toFixed(2)}%` : "—"}
            </p>
          </div>

          <div className="panel p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-white/[0.06]"><Activity className="w-4 h-4 text-[var(--text-dim)]" /></div>
              <span className="text-xs text-[var(--text-dim)] font-medium">주요 종목</span>
            </div>
            <p className="text-xl font-bold tabular-nums text-slate-200">
              {prices.length > 0 ? `${winners}↑ / ${losers}↓` : "—"}
            </p>
            <p className="text-xs text-[var(--text-mute)] mt-1">전체 {prices.length}종목</p>
          </div>
        </section>

        {/* 미국/한국주식 분리 요약 */}
        {summary && (summary.usdMarketValue > 0 || summary.krwMarketValue > 0) && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {summary.usdMarketValue > 0 && (
              <div className="panel p-4 border-blue-500/20">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded-full">🇺🇸 미국주식 (USD)</span>
                  <span className="text-xs text-[var(--text-mute)]">₩{formatNumber(summary.exchangeRate, 1)} 적용</span>
                </div>
                <p className="text-2xl font-bold tabular-nums text-white">${formatNumber(summary.usdMarketValue, 2)}</p>
                <p className="text-sm text-[var(--text-dim)] mt-0.5">≈ {formatNumber(Math.round(summary.usdMarketValueKRW))}원</p>
              </div>
            )}
            {summary.krwMarketValue > 0 && (
              <div className="panel p-4 border-rose-500/20">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded-full">🇰🇷 국내주식 (KRW)</span>
                </div>
                <p className="text-2xl font-bold tabular-nums text-white">{formatNumber(summary.krwMarketValue)}원</p>
              </div>
            )}
          </section>
        )}

        {/* 관심종목 시세 */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[var(--text-mute)]" />
              <h2 className="text-sm font-semibold text-slate-200">주요 종목</h2>
              <span className="text-xs text-[var(--text-mute)] bg-white/[0.06] px-2 py-0.5 rounded-full">국내</span>
            </div>
            <Link href="/market" className="text-xs text-violet-300 hover:text-violet-200 transition-colors font-medium">시장 보기 →</Link>
          </div>

          {loadingPrices ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
              {watchlist.map((s) => <div key={s} className="h-32 panel animate-pulse" />)}
            </div>
          ) : prices.length === 0 ? (
            <div className="panel p-8 text-center text-[var(--text-mute)] text-sm">API 응답 없음 — 설정에서 연결을 확인해 주세요</div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
              {prices.map((p) => (
                <Link key={p.symbol} href={`/market?symbol=${p.symbol}`}>
                  <PriceCard symbol={p.symbol} name={p.symbolName ?? p.symbol} price={p.currentPrice ?? 0}
                    change={p.changePrice ?? 0} changeRate={p.changeRate ?? 0} volume={p.volume} />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 보유 종목 */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-[var(--text-mute)]" />
              <h2 className="text-sm font-semibold text-slate-200">보유 종목</h2>
              {holdings.length > 0 && <span className="text-xs text-[var(--text-mute)] bg-white/[0.06] px-2 py-0.5 rounded-full">{holdings.length}종목</span>}
            </div>
            {holdings.length > 0 && <Link href="/portfolio" className="text-xs text-violet-300 hover:text-violet-200 font-medium">상세 보기 →</Link>}
          </div>

          {!selectedAccount ? (
            <div className="panel p-8 text-center text-[var(--text-mute)] text-sm">상단에서 계좌를 선택하면 보유 종목이 표시됩니다</div>
          ) : loadingHoldings ? (
            <div className="panel p-8 text-center text-[var(--text-mute)] text-sm animate-pulse">보유 종목 불러오는 중…</div>
          ) : holdings.length === 0 ? (
            <div className="panel p-8 text-center text-[var(--text-mute)] text-sm">보유 종목이 없습니다</div>
          ) : (
            <div className="panel overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-white/[0.03]">
                    {["종목", "수량", "평균단가", "현재가", "평가금액(KRW)", "손익", "수익률"].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs text-[var(--text-dim)] text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => {
                    const isUS = h.currency === "USD";
                    const fmtNative = (v: number) => isUS ? `$${formatNumber(v, 2)}` : `${formatNumber(v, 0)}원`;
                    return (
                      <tr key={h.symbol} className="border-b border-[var(--border)] hover:bg-white/[0.03] transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-slate-100 font-semibold">{h.symbolName}</p>
                          <p className="text-xs text-[var(--text-mute)] font-mono">{h.symbol}</p>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-200">{formatNumber(h.quantity, 0)}</td>
                        <td className="px-4 py-3 tabular-nums text-[var(--text-dim)]">{fmtNative(h.averagePrice)}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-200 font-medium">{fmtNative(h.lastPrice)}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-200">
                          <p className="font-medium">{formatNumber(Math.round(h.marketValueKRW), 0)}원</p>
                          {isUS && <p className="text-xs text-[var(--text-mute)]">{fmtNative(h.marketValueNative)}</p>}
                        </td>
                        <td className={`px-4 py-3 tabular-nums font-semibold ${h.profitLossRate >= 0 ? "text-rose-400" : "text-blue-400"}`}>
                          <p>{h.profitLossRate >= 0 ? "+" : ""}{fmtNative(h.profitLossNative)}</p>
                          {isUS && <p className="text-xs opacity-70">{h.profitLossRate >= 0 ? "+" : ""}{formatNumber(Math.round(h.profitLossKRW), 0)}원</p>}
                        </td>
                        <td className={`px-4 py-3 tabular-nums font-semibold ${h.profitLossRate >= 0 ? "text-rose-400" : "text-blue-400"}`}>
                          {h.profitLossRate >= 0 ? "+" : ""}{h.profitLossRate.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
