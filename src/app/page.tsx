"use client";

import { useEffect, useRef, useState, Fragment } from "react";
import Header from "@/components/Header";
import { useAppStore } from "@/store/useAppStore";
import { extractArray } from "@/lib/parse";
import { formatNumber, compactKRW } from "@/lib/utils";
import {
  ResponsiveContainer, Area, ComposedChart, Line, Bar, PieChart, Pie, Cell,
  ScatterChart, Scatter, ZAxis, XAxis, YAxis, Tooltip,
} from "recharts";
import {
  Activity, ArrowRight, ShieldAlert, TrendingUp, TrendingDown, Dice5, PieChart as PieIcon, Radio, Wallet,
  Cpu, Lightbulb, CheckCircle2, Sigma, Scale,
} from "lucide-react";
import Link from "next/link";

interface PriceData { symbol: string; symbolName: string; currentPrice: number; changePrice: number; changeRate: number; volume: number; }
interface HoldingRow {
  symbol: string; symbolName: string; currency: string; quantity: number; lastPrice: number; averagePrice: number;
  marketValueNative: number; marketValueKRW: number; profitLossNative: number; profitLossKRW: number; profitLossRate: number;
}
interface Summary {
  exchangeRate: number; krwMarketValue: number; usdMarketValue: number; usdMarketValueKRW: number;
  totalMarketValueKRW: number; totalPurchaseKRW: number; totalPnlKRW: number; totalPnlRate: number;
  usdDailyPnlKRW: number; krwDailyPnl: number; dailyPnlRate: number;
}
interface Metrics {
  totalReturn: number; annualReturn: number; annualVolatility: number; sharpe: number; sortino: number;
  maxDrawdown: number; calmar: number; var95Hist: number; var99Hist: number; var95Param: number; cvar95: number;
  downsideDeviation: number; bestDay: number; worstDay: number; positiveDayRatio: number; skewness: number; kurtosis: number; observations: number;
}
interface MC {
  days: number; sims: number; start: number;
  band: { day: number; p5: number; p25: number; p50: number; p75: number; p95: number }[];
  finalP5: number; finalP50: number; finalP95: number; probLoss: number; expectedReturn: number;
}
interface MPTPortfolio { ret: number; vol: number; sharpe: number }
interface MPT {
  assets: { symbol: string; expReturn: number; volatility: number; currentWeight: number; maxSharpeWeight: number; minVolWeight: number }[];
  correlation: number[][];
  frontier: { ret: number; vol: number; sharpe: number }[];
  current: MPTPortfolio; maxSharpe: MPTPortfolio; minVol: MPTPortfolio;
}
interface Analytics {
  currentValue: number; observations: number; history: { date: string; value: number }[];
  metrics: Metrics | null; monteCarlo: MC | null;
  allocation: { symbol: string; value: number; weight: number; currency: string }[];
  mpt: MPT | null;
  returnHist: { ret: number; count: number }[];
  benchmark: { beta: number; alpha: number; correlation: number; r2: number; trackingError: number; totalReturn: number; series: { date: string; value: number }[] } | null;
}
interface FeedItem { id: number; time: string; symbol: string; name: string; price: number; change: number; dir: 1 | -1 | 0; isUS: boolean; }
interface AutoAI {
  symbol: string; isUS: boolean; exchangeRate: number;
  auto: { ensembleMembers: string[]; agreement: number; selectedCount: number; lowConfidence: boolean; pbo: number | null; dsr: number | null;
    candidates: { id: string; kind: string; oosReturn: number; oosSharpe: number; selected: boolean }[]; };
  result: { metrics: { totalReturn: number; sharpe: number; maxDrawdown: number } };
  analysis: {
    recommendation: { action: "BUY" | "HOLD" | "SELL" | "WAIT"; reason: string; conviction: string; price: number; stopLoss: number; takeProfit: number; suggestedShares: number; suggestedAmountKRW: number; riskRewardRatio: number; };
    stats: { winRate: number; avgReturnPct: number; expectancyPct: number; profitFactor: number; totalTrades: number };
    insights: string[];
  };
}
const ACT: Record<string, { c: string; bg: string; label: string }> = {
  BUY: { c: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", label: "매수" },
  HOLD: { c: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30", label: "보유" },
  SELL: { c: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/30", label: "매도" },
  WAIT: { c: "text-slate-300", bg: "bg-white/[0.04] border-[var(--border)]", label: "관망" },
};

const UP = "#34d399", DOWN = "#f43f5e", ACCENT = "#a78bfa", BLUE = "#60a5fa";
const sharpeColor = (s: number) => (s >= 1 ? "#34d399" : s >= 0.5 ? "#a78bfa" : s >= 0 ? "#60a5fa" : "#f43f5e");
const corrColor = (c: number) => {
  const a = Math.min(Math.abs(c), 1);
  return c >= 0 ? `rgba(244,63,94,${0.12 + a * 0.55})` : `rgba(52,211,153,${0.12 + a * 0.55})`;
};
const PIE = ["#a78bfa", "#60a5fa", "#34d399", "#fbbf24", "#f43f5e", "#22d3ee", "#f472b6", "#818cf8"];
const axis = { tick: { fill: "#5b6577", fontSize: 10 }, tickLine: false, axisLine: false } as const;
const tip = { contentStyle: { background: "#131826", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12, color: "#e6e9f0" }, labelStyle: { color: "#9aa4b8", fontSize: 11 } };

function TabHead({ tabs, active, onSelect }: { tabs: string[]; active: number; onSelect?: (i: number) => void }) {
  return (
    <div className="flex border-b border-[var(--border)]">
      {tabs.map((t, i) => (
        <button key={t} onClick={() => onSelect?.(i)}
          className={`px-4 py-2.5 text-[11px] font-semibold tracking-wider uppercase transition-colors ${i === active ? "text-white border-b-2 border-violet-400 -mb-px" : "text-[var(--text-mute)] hover:text-[var(--text-dim)]"}`}>
          {t}
        </button>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { watchlist, selectedAccount } = useAppStore();
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [range, setRange] = useState<"1M" | "3M" | "ALL">("ALL");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [portTab, setPortTab] = useState(0);
  const [ai, setAi] = useState<AutoAI | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const pollRef = useRef<number | null>(null);
  const feedId = useRef(0);

  const runAI = () => {
    const target = holdings.length
      ? [...holdings].sort((a, b) => b.marketValueKRW - a.marketValueKRW)[0].symbol
      : (prices[0]?.symbol ?? "005930");
    setAiLoading(true);
    fetch("/api/quant/auto", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: target, interval: "1d", count: 300, budgetKRW: 1_000_000 }),
    })
      .then((r) => r.json())
      .then((d) => setAi(d.error ? null : d))
      .catch(() => setAi(null))
      .finally(() => setAiLoading(false));
  };

  // 관심종목 시세 + 실시간 피드
  useEffect(() => {
    if (watchlist.length === 0) return;
    fetch(`/api/prices?symbols=${watchlist.join(",")}`)
      .then((r) => r.json())
      .then((d) => setPrices(extractArray<PriceData>(d, "prices", "data", "items")))
      .catch(() => {});
  }, [watchlist]);

  useEffect(() => {
    if (watchlist.length === 0) return;
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(() => {
      fetch(`/api/prices?symbols=${watchlist.join(",")}&fast=1`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { prices?: Array<{ symbol: string; currentPrice: number }> } | null) => {
          if (!d) return;
          const list = extractArray<{ symbol: string; currentPrice: number }>(d, "prices");
          if (!list.length) return;
          setPrices((prev) => {
            const newFeed: FeedItem[] = [];
            const next = prev.map((p) => {
              const m = list.find((x) => x.symbol === p.symbol);
              if (m && m.currentPrice !== p.currentPrice) {
                const dir: 1 | -1 | 0 = m.currentPrice > p.currentPrice ? 1 : m.currentPrice < p.currentPrice ? -1 : 0;
                newFeed.push({ id: feedId.current++, time: "방금", symbol: p.symbol, name: p.symbolName ?? p.symbol, price: m.currentPrice, change: m.currentPrice - p.currentPrice, dir, isUS: !/^\d{6}$/.test(p.symbol) });
                return { ...p, currentPrice: m.currentPrice };
              }
              return p;
            });
            if (newFeed.length) setFeed((f) => [...newFeed, ...f].slice(0, 18));
            return next;
          });
        })
        .catch(() => {});
    }, 3000);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [watchlist]);

  // 보유 종목
  useEffect(() => {
    if (!selectedAccount) return;
    fetch(`/api/holdings?accountSeq=${selectedAccount.accountSeq}`)
      .then((r) => r.json())
      .then((d) => { setHoldings(d.holdings ?? []); setSummary(d.summary ?? null); })
      .catch(() => { setHoldings([]); setSummary(null); });
  }, [selectedAccount]);

  // 포트폴리오 분석 (백엔드: 가치히스토리 + 리스크 + 몬테카를로)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (holdings.length === 0 || !summary) { setAnalytics(null); return; }
    setLoadingAnalytics(true);
    fetch("/api/quant/portfolio-analytics", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdings: holdings.map((h) => ({ symbol: h.symbol, quantity: h.quantity, currency: h.currency })),
        exchangeRate: summary.exchangeRate,
      }),
    })
      .then((r) => r.json())
      .then((d) => setAnalytics(d.error ? null : d))
      .catch(() => setAnalytics(null))
      .finally(() => setLoadingAnalytics(false));
  }, [holdings, summary]);

  const totalKRW = summary?.totalMarketValueKRW ?? 0;
  const totalPnl = summary?.totalPnlKRW ?? 0;
  const dailyPnl = (summary?.usdDailyPnlKRW ?? 0) + (summary?.krwDailyPnl ?? 0);
  const m = analytics?.metrics ?? null;
  const mc = analytics?.monteCarlo ?? null;

  const bench = analytics?.benchmark ?? null;
  const benchMap = new Map((bench?.series ?? []).map((s) => [s.date, s.value]));
  const histData = (() => {
    const h = analytics?.history ?? [];
    const n = range === "1M" ? 22 : range === "3M" ? 66 : h.length;
    return h.slice(-n).map((p) => ({ date: p.date.slice(5), value: p.value, bench: benchMap.get(p.date) }));
  })();
  const mcData = mc?.band.map((b) => ({ day: b.day, p5: b.p5, p50: b.p50, p95: b.p95 })) ?? [];
  const mptD = analytics?.mpt ?? null;
  const histR = analytics?.returnHist ?? [];
  const frontierData = mptD?.frontier.map((f) => ({ x: f.vol * 100, y: f.ret * 100, sharpe: f.sharpe })) ?? [];
  const upDownCls = (v: number) => (v >= 0 ? "text-emerald-400" : "text-rose-400");

  return (
    <div className="min-h-screen">
      <Header title="대시보드" />
      <div className="p-5 space-y-4 max-w-[1600px] mx-auto w-full">

        {/* 엔티티 헤더 */}
        <div className="panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center"><Wallet className="w-4 h-4 text-white" /></div>
                <h2 className="text-base font-bold text-white">{selectedAccount?.accountName ?? "내 포트폴리오"}</h2>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-[var(--text-mute)]">{holdings.length} ASSETS</span>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold tabular-nums text-white">{totalKRW > 0 ? `₩${formatNumber(Math.round(totalKRW))}` : "—"}</span>
                <span className={`text-sm font-semibold tabular-nums ${upDownCls(dailyPnl)}`}>{dailyPnl >= 0 ? "+" : ""}{formatNumber(Math.round(dailyPnl))} ({summary ? (summary.dailyPnlRate >= 0 ? "+" : "") + summary.dailyPnlRate.toFixed(2) : "0.00"}%)</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {["국내·해외 통합", `환율 ₩${summary ? formatNumber(summary.exchangeRate, 1) : "-"}`, `누적손익 ${totalPnl >= 0 ? "+" : ""}${compactKRW(totalPnl)}`].map((t) => (
                  <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] text-[var(--text-dim)] border border-[var(--border)]">{t}</span>
                ))}
              </div>
            </div>
            <Link href="/lab" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold glow">
              AI 리서치 랩 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* ── 왼쪽 컬럼 ── */}
          <div className="space-y-4">
            {/* 포트폴리오 / 배분 */}
            <div className="panel overflow-hidden">
              <TabHead tabs={["포트폴리오", "자산 배분"]} active={portTab} onSelect={setPortTab} />
              {portTab === 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="text-[10px] text-[var(--text-mute)] uppercase tracking-wider">
                        {["자산", "현재가", "보유수량", "평가액", "손익"].map((h) => <th key={h} className="px-4 py-2 text-left font-medium first:text-left">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.length === 0 ? (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--text-mute)] text-xs">{selectedAccount ? "보유 종목 없음" : "계좌를 선택하세요"}</td></tr>
                      ) : holdings.map((h) => {
                        const isUS = h.currency === "USD";
                        const fmtN = (v: number) => isUS ? `$${formatNumber(v, 2)}` : `₩${formatNumber(v, 0)}`;
                        return (
                          <tr key={h.symbol} className="border-t border-[var(--border)] hover:bg-white/[0.02]">
                            <td className="px-4 py-2.5">
                              <Link href={`/market?symbol=${h.symbol}`} className="block">
                                <p className="text-white font-medium text-xs leading-tight">{h.symbolName}</p>
                                <p className="text-[10px] text-[var(--text-mute)] font-mono">{h.symbol}{isUS && " · USD"}</p>
                              </Link>
                            </td>
                            <td className="px-4 py-2.5 tabular-nums text-[var(--text-dim)] text-xs">{fmtN(h.lastPrice)}</td>
                            <td className="px-4 py-2.5 tabular-nums text-[var(--text-dim)] text-xs">{isUS ? formatNumber(h.quantity, 4) : formatNumber(h.quantity, 0)}</td>
                            <td className="px-4 py-2.5 tabular-nums text-white text-xs">₩{formatNumber(Math.round(h.marketValueKRW))}</td>
                            <td className={`px-4 py-2.5 tabular-nums text-xs font-semibold ${upDownCls(h.profitLossRate)}`}>
                              {h.profitLossRate >= 0 ? "+" : ""}{h.profitLossRate.toFixed(2)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 flex flex-col lg:flex-row items-center gap-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={(analytics?.allocation ?? []).map((a) => ({ name: a.symbol, value: a.value, weight: a.weight }))}
                        cx="50%" cy="50%" innerRadius={50} outerRadius={82} paddingAngle={2} dataKey="value">
                        {(analytics?.allocation ?? []).map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                      </Pie>
                      <Tooltip {...tip} formatter={(v: unknown, _n, p: { payload?: { weight?: number } }) => [typeof v === "number" ? `₩${formatNumber(Math.round(v))} (${((p?.payload?.weight ?? 0) * 100).toFixed(1)}%)` : "-", "평가액"]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-full lg:w-56 space-y-1.5">
                    {(analytics?.allocation ?? []).slice(0, 8).map((a, i) => (
                      <div key={a.symbol} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-[var(--text-dim)]"><span className="w-2 h-2 rounded-full" style={{ background: PIE[i % PIE.length] }} />{a.symbol}</span>
                        <span className="tabular-nums text-white">{(a.weight * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                    {!analytics && <p className="text-xs text-[var(--text-mute)]">{loadingAnalytics ? "분석 중…" : "데이터 없음"}</p>}
                  </div>
                </div>
              )}
            </div>

            {/* 리스크 분석 (과학적 방법론) */}
            <div className="panel overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)]">
                <ShieldAlert className="w-4 h-4 text-violet-300" />
                <h3 className="text-[11px] font-semibold tracking-wider uppercase text-white">리스크 분석</h3>
                <span className="text-[10px] text-[var(--text-mute)]">VaR · CVaR · Sharpe · {m ? `${m.observations}일` : "—"}</span>
              </div>
              {loadingAnalytics && !m ? (
                <div className="p-8 text-center text-[var(--text-mute)] text-xs animate-pulse">리스크 분석 계산 중… (백엔드에서 가격 히스토리 수집)</div>
              ) : m ? (
                <>
                <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-[var(--border)]">
                  {[
                    { l: "VaR 95% (1일)", v: `${(m.var95Hist * 100).toFixed(2)}%`, s: `₩${compactKRW(m.var95Hist * (analytics?.currentValue ?? 0))}`, tone: "down" },
                    { l: "VaR 99% (1일)", v: `${(m.var99Hist * 100).toFixed(2)}%`, s: `₩${compactKRW(m.var99Hist * (analytics?.currentValue ?? 0))}`, tone: "down" },
                    { l: "CVaR 95%", v: `${(m.cvar95 * 100).toFixed(2)}%`, s: "기대 손실(꼬리)", tone: "down" },
                    { l: "연 변동성", v: `${(m.annualVolatility * 100).toFixed(1)}%`, s: "표준편차(연율)" },
                    { l: "Sharpe", v: m.sharpe.toFixed(2), s: "위험조정수익", tone: m.sharpe >= 1 ? "up" : "" },
                    { l: "Sortino", v: m.sortino.toFixed(2), s: "하방위험조정", tone: m.sortino >= 1 ? "up" : "" },
                    { l: "최대낙폭", v: `${(m.maxDrawdown * 100).toFixed(1)}%`, s: `Calmar ${m.calmar.toFixed(2)}`, tone: "down" },
                    { l: "양봉 비율", v: `${(m.positiveDayRatio * 100).toFixed(0)}%`, s: `왜도 ${m.skewness.toFixed(2)}` },
                  ].map((c) => (
                    <div key={c.l} className="px-4 py-3">
                      <p className="text-[10px] text-[var(--text-mute)] mb-1">{c.l}</p>
                      <p className={`text-base font-bold tabular-nums ${c.tone === "down" ? "text-rose-400" : c.tone === "up" ? "text-emerald-400" : "text-white"}`}>{c.v}</p>
                      <p className="text-[10px] text-[var(--text-mute)] mt-0.5">{c.s}</p>
                    </div>
                  ))}
                </div>
                {histR.length > 0 && (
                  <div className="px-4 py-3 border-t border-[var(--border)]">
                    <p className="text-[10px] text-[var(--text-mute)] mb-1">일별 수익률 분포 · VaR 손실 구간 (역사적 시뮬레이션)</p>
                    <ResponsiveContainer width="100%" height={120}>
                      <ComposedChart data={histR}>
                        <XAxis dataKey="ret" {...axis} tickFormatter={(v) => `${v}%`} minTickGap={24} />
                        <YAxis {...axis} width={26} />
                        <Tooltip {...tip} formatter={(v: unknown) => [typeof v === "number" ? `${v}일` : "-", "관측"]} labelFormatter={(l) => `${l}% 일수익`} />
                        <Bar dataKey="count">
                          {histR.map((d, i) => <Cell key={i} fill={d.ret <= -m.var99Hist * 100 ? "#9f1239" : d.ret <= -m.var95Hist * 100 ? "#f43f5e" : d.ret < 0 ? "rgba(244,63,94,0.45)" : "rgba(52,211,153,0.55)"} />)}
                        </Bar>
                      </ComposedChart>
                    </ResponsiveContainer>
                    <p className="text-[10px] text-[var(--text-mute)] mt-1">진빨강 = VaR99 이탈 · 빨강 = VaR95 이탈 손실 · VaR95 {(m.var95Hist * 100).toFixed(2)}% · 99% {(m.var99Hist * 100).toFixed(2)}%</p>
                  </div>
                )}
                </>
              ) : (
                <div className="p-8 text-center text-[var(--text-mute)] text-xs">보유 종목이 있으면 VaR·Sharpe 등 리스크 지표를 계산합니다</div>
              )}
            </div>
          </div>

          {/* ── 오른쪽 컬럼 ── */}
          <div className="space-y-4">
            {/* 포트폴리오 가치 추이 */}
            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-violet-300" />
                  <h3 className="text-[11px] font-semibold tracking-wider uppercase text-white">포트폴리오 가치 추이</h3>
                </div>
                <div className="flex gap-1">
                  {(["1M", "3M", "ALL"] as const).map((r) => (
                    <button key={r} onClick={() => setRange(r)} className={`px-2 py-0.5 text-[10px] rounded ${range === r ? "bg-white/[0.1] text-white" : "text-[var(--text-mute)]"}`}>{r}</button>
                  ))}
                </div>
              </div>
              <div className="p-4">
                {histData.length > 1 ? (
                  <>
                  <ResponsiveContainer width="100%" height={230}>
                    <ComposedChart data={histData}>
                      <defs><linearGradient id="bal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ACCENT} stopOpacity={0.4} /><stop offset="100%" stopColor={ACCENT} stopOpacity={0} /></linearGradient></defs>
                      <XAxis dataKey="date" {...axis} minTickGap={50} />
                      <YAxis {...axis} width={52} domain={["auto", "auto"]} tickFormatter={(v) => `₩${compactKRW(v)}`} />
                      <Tooltip {...tip} formatter={(v: unknown, n) => [typeof v === "number" ? `₩${formatNumber(Math.round(v))}` : "-", n === "bench" ? "KOSPI200(정규화)" : "평가액"]} />
                      <Area dataKey="value" stroke={ACCENT} strokeWidth={2} fill="url(#bal)" name="value" />
                      {bench && <Line dataKey="bench" stroke="#94a3b8" strokeWidth={1.5} dot={false} strokeDasharray="4 3" name="bench" />}
                    </ComposedChart>
                  </ResponsiveContainer>
                  {bench && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-1 text-[10px]">
                      <span className="text-[var(--text-mute)]">vs KOSPI200 · 베타 <span className="text-white tabular-nums">{bench.beta.toFixed(2)}</span></span>
                      <span className="text-[var(--text-mute)]">알파(연) <span className={`tabular-nums ${bench.alpha >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{bench.alpha >= 0 ? "+" : ""}{(bench.alpha * 100).toFixed(1)}%</span></span>
                      <span className="text-[var(--text-mute)]">상관 <span className="text-white tabular-nums">{bench.correlation.toFixed(2)}</span></span>
                      <span className="text-[var(--text-mute)]">R² <span className="text-white tabular-nums">{(bench.r2 * 100).toFixed(0)}%</span></span>
                      <span className="text-[var(--text-mute)]">추적오차 <span className="text-white tabular-nums">{(bench.trackingError * 100).toFixed(1)}%</span></span>
                      <span className="text-slate-400">┄ 벤치마크</span>
                    </div>
                  )}
                  </>
                ) : (
                  <div className="h-[230px] flex items-center justify-center text-[var(--text-mute)] text-xs animate-pulse">{loadingAnalytics ? "가격 히스토리 수집 중…" : "데이터 없음"}</div>
                )}
              </div>
            </div>

            {/* 몬테카를로 시뮬레이션 */}
            <div className="panel overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)]">
                <Dice5 className="w-4 h-4 text-violet-300" />
                <h3 className="text-[11px] font-semibold tracking-wider uppercase text-white">몬테카를로 시뮬레이션</h3>
                <span className="text-[10px] text-[var(--text-mute)]">{mc ? `${mc.sims.toLocaleString()}회 · ${mc.days}일 전망` : "—"}</span>
              </div>
              {mc ? (
                <div className="p-4">
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[
                      { l: "비관 (5%)", v: `₩${compactKRW(mc.finalP5)}`, c: "text-rose-400" },
                      { l: "기대 (중앙)", v: `${mc.expectedReturn >= 0 ? "+" : ""}${(mc.expectedReturn * 100).toFixed(1)}%`, c: "text-white" },
                      { l: "낙관 (95%)", v: `₩${compactKRW(mc.finalP95)}`, c: "text-emerald-400" },
                    ].map((x) => (
                      <div key={x.l} className="panel-2 px-3 py-2">
                        <p className="text-[10px] text-[var(--text-mute)]">{x.l}</p>
                        <p className={`text-sm font-bold tabular-nums ${x.c}`}>{x.v}</p>
                      </div>
                    ))}
                  </div>
                  <ResponsiveContainer width="100%" height={170}>
                    <ComposedChart data={mcData}>
                      <defs><linearGradient id="mc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={BLUE} stopOpacity={0.3} /><stop offset="100%" stopColor={BLUE} stopOpacity={0} /></linearGradient></defs>
                      <XAxis dataKey="day" {...axis} tickFormatter={(v) => `${v}d`} minTickGap={30} />
                      <YAxis {...axis} width={48} domain={["auto", "auto"]} tickFormatter={(v) => `₩${compactKRW(v)}`} />
                      <Tooltip {...tip} formatter={(v: unknown, n) => [typeof v === "number" ? `₩${formatNumber(Math.round(v))}` : "-", n === "p50" ? "중앙값" : n === "p95" ? "95%" : "5%"]} labelFormatter={(l) => `${l}일 후`} />
                      <Area dataKey="p50" stroke={BLUE} strokeWidth={2} fill="url(#mc)" />
                      <Line dataKey="p95" stroke={UP} strokeWidth={1} dot={false} strokeDasharray="3 3" />
                      <Line dataKey="p5" stroke={DOWN} strokeWidth={1} dot={false} strokeDasharray="3 3" />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <p className="text-[11px] text-[var(--text-mute)] mt-2 flex items-center gap-1.5">
                    <ShieldAlert className="w-3 h-3" />30일 내 손실 확률 <span className={`font-semibold ${mc.probLoss > 0.5 ? "text-rose-400" : "text-emerald-400"}`}>{(mc.probLoss * 100).toFixed(1)}%</span> · 부트스트랩+정규분포 혼합 샘플링
                  </p>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-[var(--text-mute)] text-xs animate-pulse">{loadingAnalytics ? "시뮬레이션 준비 중…" : "데이터 없음"}</div>
              )}
            </div>
          </div>
        </div>

        {/* 현대 포트폴리오 이론 (MPT) */}
        {(mptD || (loadingAnalytics && holdings.length >= 2)) && (
          <div className="panel overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)]">
              <Sigma className="w-4 h-4 text-violet-300" />
              <h3 className="text-[11px] font-semibold tracking-wider uppercase text-white">현대 포트폴리오 이론 · 효율적 투자선</h3>
              <span className="text-[10px] text-[var(--text-mute)]">Markowitz 평균-분산 · 4,000 시뮬</span>
            </div>
            {mptD ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:divide-x divide-[var(--border)]">
                {/* 효율적 투자선 */}
                <div className="p-4">
                  <ResponsiveContainer width="100%" height={240}>
                    <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                      <XAxis type="number" dataKey="x" name="변동성" unit="%" {...axis} tickFormatter={(v) => v.toFixed(0)} />
                      <YAxis type="number" dataKey="y" name="기대수익" unit="%" {...axis} width={40} tickFormatter={(v) => v.toFixed(0)} />
                      <ZAxis range={[16, 16]} />
                      <Tooltip {...tip} cursor={{ strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.2)" }}
                        formatter={(v: unknown, n) => [typeof v === "number" ? `${v.toFixed(1)}%` : "-", n === "x" ? "변동성" : "기대수익"]} />
                      <Scatter data={frontierData} isAnimationActive={false}>
                        {frontierData.map((d, i) => <Cell key={i} fill={sharpeColor(d.sharpe)} fillOpacity={0.45} />)}
                      </Scatter>
                      <Scatter data={[{ x: mptD.current.vol * 100, y: mptD.current.ret * 100 }]} fill="#ffffff" shape="diamond" isAnimationActive={false} />
                      <Scatter data={[{ x: mptD.maxSharpe.vol * 100, y: mptD.maxSharpe.ret * 100 }]} fill={ACCENT} isAnimationActive={false} />
                      <Scatter data={[{ x: mptD.minVol.vol * 100, y: mptD.minVol.ret * 100 }]} fill={BLUE} isAnimationActive={false} />
                    </ScatterChart>
                  </ResponsiveContainer>
                  <div className="flex gap-3 text-[10px] text-[var(--text-mute)] justify-center mt-1">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rotate-45 bg-white inline-block" />현재</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: ACCENT }} />최대샤프(최적)</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: BLUE }} />최소변동</span>
                  </div>
                </div>

                {/* 리밸런싱 + 상관 */}
                <div className="p-4 space-y-3">
                  <div className="panel-2 px-3 py-2 flex items-start gap-2">
                    <Scale className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-[var(--text-dim)] leading-snug">
                      최적(최대샤프) 배분 시 <span className="text-white">샤프 {mptD.current.sharpe.toFixed(2)}→{mptD.maxSharpe.sharpe.toFixed(2)}</span>,
                      변동성 {(mptD.current.vol * 100).toFixed(1)}%→<span className="text-emerald-400">{(mptD.maxSharpe.vol * 100).toFixed(1)}%</span>,
                      기대수익 {(mptD.current.ret * 100).toFixed(1)}%→{(mptD.maxSharpe.ret * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {mptD.assets.map((a) => {
                      const diff = a.maxSharpeWeight - a.currentWeight;
                      return (
                        <div key={a.symbol} className="text-[11px]">
                          <div className="flex justify-between mb-0.5">
                            <span className="text-[var(--text-dim)] font-mono">{a.symbol}</span>
                            <span className="text-[var(--text-mute)]">현재 {(a.currentWeight * 100).toFixed(0)}% → 최적 <span className="text-violet-300">{(a.maxSharpeWeight * 100).toFixed(0)}%</span> {Math.abs(diff) > 0.02 ? <span className={diff > 0 ? "text-emerald-400" : "text-rose-400"}>{diff > 0 ? "↑늘리기" : "↓줄이기"}</span> : <span className="text-[var(--text-mute)]">유지</span>}</span>
                          </div>
                          <div className="h-1.5 bg-white/[0.06] rounded relative overflow-hidden">
                            <div className="h-full bg-slate-500 rounded" style={{ width: `${Math.min(a.currentWeight * 100, 100)}%` }} />
                            <div className="absolute top-0 h-full w-0.5 bg-violet-400" style={{ left: `${Math.min(a.maxSharpeWeight * 100, 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* 상관관계 히트맵 */}
                  <div>
                    <p className="text-[10px] text-[var(--text-mute)] mb-1">상관관계 (낮을수록 분산효과 ↑)</p>
                    <div className="inline-grid gap-0.5 text-[9px]" style={{ gridTemplateColumns: `auto repeat(${mptD.assets.length}, minmax(28px, 1fr))` }}>
                      <span />
                      {mptD.assets.map((a) => <span key={a.symbol} className="text-[var(--text-mute)] text-center truncate">{a.symbol.slice(0, 4)}</span>)}
                      {mptD.correlation.map((row, i) => (
                        <Fragment key={i}>
                          <span className="text-[var(--text-mute)] pr-1 self-center truncate">{mptD.assets[i].symbol.slice(0, 4)}</span>
                          {row.map((c, j) => (
                            <span key={`${i}-${j}`} className="text-center py-1 rounded tabular-nums text-white/80" style={{ background: corrColor(c) }}>{c.toFixed(1)}</span>
                          ))}
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-[var(--text-mute)] text-xs animate-pulse">{loadingAnalytics ? "효율적 투자선 4,000회 시뮬레이션 중…" : "데이터 없음"}</div>
            )}
          </div>
        )}

        {/* AI 종합 인텔리전스 (백엔드 9-모델) */}
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-violet-300" />
              <h3 className="text-[11px] font-semibold tracking-wider uppercase text-white">AI 종합 인텔리전스</h3>
              {ai && <span className="text-[10px] text-[var(--text-mute)] font-mono">{ai.symbol}</span>}
              <span className="text-[10px] text-[var(--text-mute)]">규칙6·신경망·GRU·강화학습 백엔드 앙상블</span>
            </div>
            <button onClick={runAI} disabled={aiLoading}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-semibold disabled:opacity-50 glow">
              {aiLoading ? <span className="animate-pulse">분석 중…</span> : <><Cpu className="w-3.5 h-3.5" />AI 분석 실행</>}
            </button>
          </div>

          {aiLoading ? (
            <div className="p-10 text-center text-[var(--text-dim)] text-sm animate-pulse">백엔드에서 9개 모델 학습·검증·앙상블 중… (수십 초 소요)</div>
          ) : ai ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border)]">
              {/* 추천 */}
              <div className={`p-4 border-l-2 ${ACT[ai.analysis.recommendation.action].bg}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-2xl font-extrabold ${ACT[ai.analysis.recommendation.action].c}`}>{ACT[ai.analysis.recommendation.action].label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 ${ACT[ai.analysis.recommendation.action].c}`}>확신도 {ai.analysis.recommendation.conviction}</span>
                </div>
                <p className="text-xs text-[var(--text-dim)] mb-3 leading-snug">{ai.analysis.recommendation.reason}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><p className="text-[10px] text-[var(--text-mute)]">진입가</p><p className="text-white tabular-nums">{ai.isUS ? `$${formatNumber(ai.analysis.recommendation.price, 2)}` : `₩${formatNumber(ai.analysis.recommendation.price, 0)}`}</p></div>
                  <div><p className="text-[10px] text-[var(--text-mute)]">손익비</p><p className="text-violet-300 tabular-nums">1:{ai.analysis.recommendation.riskRewardRatio.toFixed(1)}</p></div>
                  <div><p className="text-[10px] text-blue-400">손절</p><p className="text-blue-400 tabular-nums">{ai.isUS ? `$${formatNumber(ai.analysis.recommendation.stopLoss, 2)}` : `₩${formatNumber(ai.analysis.recommendation.stopLoss, 0)}`}</p></div>
                  <div><p className="text-[10px] text-emerald-400">목표</p><p className="text-emerald-400 tabular-nums">{ai.isUS ? `$${formatNumber(ai.analysis.recommendation.takeProfit, 2)}` : `₩${formatNumber(ai.analysis.recommendation.takeProfit, 0)}`}</p></div>
                  <div className="col-span-2"><p className="text-[10px] text-[var(--text-mute)]">추천 수량(예산 100만)</p><p className="text-white tabular-nums">{ai.isUS ? ai.analysis.recommendation.suggestedShares.toFixed(4) : formatNumber(ai.analysis.recommendation.suggestedShares)}주 · ≈₩{formatNumber(Math.round(ai.analysis.recommendation.suggestedAmountKRW))}</p></div>
                </div>
                <Link href={`/market?symbol=${ai.symbol}&side=${ai.analysis.recommendation.action === "SELL" ? "SELL" : "BUY"}`} className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-white px-3 py-1 rounded bg-white/[0.08] hover:bg-white/[0.14]">주문창으로 <ArrowRight className="w-3 h-3" /></Link>
              </div>

              {/* 인사이트 */}
              <div className="p-4">
                <div className="flex items-center gap-1.5 mb-2"><Lightbulb className="w-3.5 h-3.5 text-amber-400" /><span className="text-[11px] font-semibold text-white">인사이트</span></div>
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {ai.analysis.insights.map((s, i) => <p key={i} className="text-[11px] text-[var(--text-dim)] leading-relaxed">{s}</p>)}
                </div>
              </div>

              {/* 앙상블 + 신뢰도 */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-white">선택 모델 ({ai.auto.selectedCount})</span>
                  <span className="text-[10px] text-[var(--text-mute)]">롱 동의 {(ai.auto.agreement * 100).toFixed(0)}%</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {ai.auto.ensembleMembers.map((mn) => <span key={mn} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-violet-500/10 text-violet-200 border border-violet-500/20"><CheckCircle2 className="w-2.5 h-2.5" />{mn}</span>)}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="panel-2 px-2.5 py-1.5"><p className="text-[10px] text-[var(--text-mute)]">검증 수익률</p><p className={`tabular-nums font-semibold ${ai.result.metrics.totalReturn >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{ai.result.metrics.totalReturn >= 0 ? "+" : ""}{(ai.result.metrics.totalReturn * 100).toFixed(1)}%</p></div>
                  <div className="panel-2 px-2.5 py-1.5"><p className="text-[10px] text-[var(--text-mute)]">샤프</p><p className="tabular-nums font-semibold text-white">{ai.result.metrics.sharpe.toFixed(2)}</p></div>
                  {ai.auto.pbo != null && <div className="panel-2 px-2.5 py-1.5"><p className="text-[10px] text-[var(--text-mute)]">PBO(과적합)</p><p className={`tabular-nums font-semibold ${ai.auto.pbo > 0.5 ? "text-amber-400" : "text-emerald-400"}`}>{(ai.auto.pbo * 100).toFixed(0)}%</p></div>}
                  {ai.auto.dsr != null && <div className="panel-2 px-2.5 py-1.5"><p className="text-[10px] text-[var(--text-mute)]">DSR(신뢰)</p><p className="tabular-nums font-semibold text-white">{(ai.auto.dsr * 100).toFixed(0)}%</p></div>}
                </div>
                {ai.auto.lowConfidence && <p className="text-[10px] text-amber-400 mt-2">⚠ 우위 모델이 약해 낮은 확신도</p>}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-[var(--text-mute)] text-xs">가장 비중 큰 보유종목을 9개 모델로 백엔드에서 학습·앙상블 분석합니다. <span className="text-violet-300">AI 분석 실행</span>을 눌러주세요.</div>
          )}
        </div>

        {/* 하단: 관심종목 + 실시간 피드 */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* 관심종목 */}
          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
              <div className="flex items-center gap-2"><PieIcon className="w-4 h-4 text-violet-300" /><h3 className="text-[11px] font-semibold tracking-wider uppercase text-white">관심 종목</h3></div>
              <Link href="/market" className="text-[10px] text-violet-300 hover:text-violet-200">시장 →</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <tbody>
                  {prices.length === 0 ? (
                    <tr><td className="px-4 py-8 text-center text-[var(--text-mute)] text-xs">시세 로딩…</td></tr>
                  ) : prices.map((p) => {
                    const isUS = !/^\d{6}$/.test(p.symbol);
                    const up = (p.changeRate ?? 0) >= 0;
                    return (
                      <tr key={p.symbol} className="border-t border-[var(--border)] hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5"><Link href={`/market?symbol=${p.symbol}`}><p className="text-white text-xs font-medium">{p.symbolName ?? p.symbol}</p><p className="text-[10px] text-[var(--text-mute)] font-mono">{p.symbol}</p></Link></td>
                        <td className="px-4 py-2.5 tabular-nums text-white text-xs text-right">{isUS ? `$${formatNumber(p.currentPrice, 2)}` : `₩${formatNumber(p.currentPrice, 0)}`}</td>
                        <td className={`px-4 py-2.5 tabular-nums text-xs text-right font-semibold ${up ? "text-emerald-400" : "text-rose-400"}`}>
                          <span className="inline-flex items-center gap-1 justify-end">{up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{up ? "+" : ""}{(p.changeRate ?? 0).toFixed(2)}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 실시간 시세 피드 */}
          <div className="panel overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)]">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              <h3 className="text-[11px] font-semibold tracking-wider uppercase text-white">실시간 시세 변동</h3>
              <span className="text-[10px] text-[var(--text-mute)]">3초 간격</span>
            </div>
            <div className="max-h-[280px] overflow-y-auto">
              {feed.length === 0 ? (
                <div className="px-4 py-8 text-center text-[var(--text-mute)] text-xs">시세 변동을 기다리는 중…</div>
              ) : feed.map((f) => (
                <div key={f.id} className="flex items-center gap-3 px-4 py-2 border-t border-[var(--border)] text-xs">
                  <span className="text-[10px] text-emerald-400 w-10 shrink-0">{f.time}</span>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${f.dir > 0 ? "bg-emerald-400" : f.dir < 0 ? "bg-rose-400" : "bg-slate-500"}`} />
                  <span className="text-white font-medium flex-1 truncate">{f.name} <span className="text-[var(--text-mute)] font-mono">{f.symbol}</span></span>
                  <span className="tabular-nums text-[var(--text-dim)]">{f.isUS ? `$${formatNumber(f.price, 2)}` : `₩${formatNumber(f.price, 0)}`}</span>
                  <span className={`tabular-nums w-20 text-right ${f.dir > 0 ? "text-emerald-400" : f.dir < 0 ? "text-rose-400" : "text-[var(--text-mute)]"}`}>{f.change >= 0 ? "+" : ""}{f.isUS ? f.change.toFixed(2) : formatNumber(Math.round(f.change))}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
