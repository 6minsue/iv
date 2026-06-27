"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { useAppStore } from "@/store/useAppStore";
import { formatNumber, compactKRW } from "@/lib/utils";
import {
  ResponsiveContainer, ComposedChart, Area, Line, Scatter, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Receipt, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import Link from "next/link";

interface Tx { date: string; datetime: string; symbol: string; side: "BUY" | "SELL"; quantity: number; price: number; amount: number; commission: number; tax: number; currency: string; }
interface Summary {
  txCount: number; buyCount: number; sellCount: number; firstDate: string;
  totalBuyKRW: number; totalSellKRW: number; realizedPnlKRW: number;
  currentValueKRW: number; currentCostKRW: number; unrealizedPnlKRW: number;
}
interface Data { transactions: Tx[]; valueHistory: { date: string; value: number; cost: number }[]; summary: Summary | null; }

const axis = { tick: { fill: "#5b6577", fontSize: 10 }, tickLine: false, axisLine: false } as const;
const tip = { contentStyle: { background: "#131826", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12, color: "#e6e9f0" }, labelStyle: { color: "#9aa4b8", fontSize: 11 } };

export default function TransactionsPage() {
  const { selectedAccount } = useAppStore();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedAccount) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setErr(null);
    fetch("/api/exchange-rate")
      .then((r) => r.json()).then((e) => Number(e.rate ?? 1400)).catch(() => 1400)
      .then((rate) =>
        fetch(`/api/transactions?accountSeq=${selectedAccount.accountSeq}&exchangeRate=${rate}`)
          .then((r) => r.json())
          .then((d) => { if (d.error) { setErr(d.error); setData(null); } else setData(d); })
      )
      .catch(() => setErr("거래내역을 불러올 수 없습니다"))
      .finally(() => setLoading(false));
  }, [selectedAccount]);

  const s = data?.summary ?? null;

  // 차트: 가치 + 원금 + 매수/매도 마커
  const buyDates = new Set((data?.transactions ?? []).filter((t) => t.side === "BUY").map((t) => t.date));
  const sellDates = new Set((data?.transactions ?? []).filter((t) => t.side === "SELL").map((t) => t.date));
  const chartData = (data?.valueHistory ?? []).map((p) => ({
    date: p.date.slice(2),
    value: p.value,
    cost: p.cost,
    buy: buyDates.has(p.date) ? p.value : undefined,
    sell: sellDates.has(p.date) ? p.value : undefined,
  }));

  const fmtNative = (t: Tx) => (t.currency === "USD" ? `$${formatNumber(t.price, t.price < 10 ? 4 : 2)}` : `₩${formatNumber(t.price, 0)}`);

  return (
    <div className="min-h-screen">
      <Header title="거래내역" />
      <div className="p-5 space-y-4 max-w-[1400px] mx-auto w-full">

        {!selectedAccount ? (
          <div className="panel p-12 text-center text-[var(--text-mute)] text-sm">상단에서 계좌를 선택하세요</div>
        ) : loading ? (
          <div className="panel p-12 text-center text-[var(--text-dim)] text-sm animate-pulse">거래내역 수집 + 자산 재구성 중… (실제 매수시점 반영)</div>
        ) : err ? (
          <div className="panel p-6 text-amber-400 text-sm">{err}</div>
        ) : s ? (
          <>
            {/* 요약 */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { l: "현재 평가액", v: `₩${compactKRW(s.currentValueKRW)}`, sub: `원금 ₩${compactKRW(s.currentCostKRW)}`, c: "text-white" },
                { l: "미실현 손익", v: `${s.unrealizedPnlKRW >= 0 ? "+" : ""}₩${compactKRW(s.unrealizedPnlKRW)}`, sub: `${s.currentCostKRW > 0 ? ((s.unrealizedPnlKRW / s.currentCostKRW) * 100).toFixed(1) : "0"}%`, c: s.unrealizedPnlKRW >= 0 ? "text-emerald-400" : "text-rose-400" },
                { l: "실현 손익", v: `${s.realizedPnlKRW >= 0 ? "+" : ""}₩${compactKRW(s.realizedPnlKRW)}`, sub: "매도 확정", c: s.realizedPnlKRW >= 0 ? "text-emerald-400" : "text-rose-400" },
                { l: "총 손익", v: `${(s.realizedPnlKRW + s.unrealizedPnlKRW) >= 0 ? "+" : ""}₩${compactKRW(s.realizedPnlKRW + s.unrealizedPnlKRW)}`, sub: "실현+미실현", c: (s.realizedPnlKRW + s.unrealizedPnlKRW) >= 0 ? "text-emerald-400" : "text-rose-400" },
                { l: "총 매수 / 매도", v: `₩${compactKRW(s.totalBuyKRW)}`, sub: `매도 ₩${compactKRW(s.totalSellKRW)}`, c: "text-slate-200" },
                { l: "거래 건수", v: `${s.txCount}건`, sub: `매수 ${s.buyCount} · 매도 ${s.sellCount} · ${s.firstDate}~`, c: "text-slate-200" },
              ].map((c) => (
                <div key={c.l} className="panel p-3">
                  <p className="text-[10px] text-[var(--text-mute)] mb-1">{c.l}</p>
                  <p className={`text-base font-bold tabular-nums ${c.c}`}>{c.v}</p>
                  <p className="text-[10px] text-[var(--text-mute)] mt-0.5">{c.sub}</p>
                </div>
              ))}
            </div>

            {/* 자산 가치 vs 원금 추이 (실제 거래 기반) */}
            <div className="panel p-5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-violet-300" />
                  <h3 className="text-[11px] font-semibold tracking-wider uppercase text-white">자산 가치 vs 투자원금 추이</h3>
                </div>
                <div className="flex gap-3 text-[10px] text-[var(--text-dim)]">
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5" style={{ background: "#a78bfa" }} />평가액</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 border-t border-dashed border-slate-400" />원금</span>
                  <span className="flex items-center gap-1"><ArrowDownCircle className="w-2.5 h-2.5 text-emerald-400" />매수</span>
                  <span className="flex items-center gap-1"><ArrowUpCircle className="w-2.5 h-2.5 text-rose-400" />매도</span>
                </div>
              </div>
              <p className="text-[10px] text-[var(--text-mute)] mb-3">실제 체결 시점·수량을 반영해 재구성 · 평가액과 원금의 간격 = 미실현손익 (USD는 현재 환율 적용)</p>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={chartData}>
                  <defs><linearGradient id="tv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" stopOpacity={0.35} /><stop offset="100%" stopColor="#a78bfa" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" {...axis} minTickGap={50} />
                  <YAxis {...axis} width={54} domain={["auto", "auto"]} tickFormatter={(v) => `₩${compactKRW(v)}`} />
                  <Tooltip {...tip} formatter={(v: unknown, n) => [typeof v === "number" ? `₩${formatNumber(Math.round(v))}` : "-", n === "cost" ? "투자원금" : n === "value" ? "평가액" : n === "buy" ? "매수" : "매도"]} />
                  <Area dataKey="value" stroke="#a78bfa" strokeWidth={2} fill="url(#tv)" name="value" />
                  <Line dataKey="cost" stroke="#94a3b8" strokeWidth={1.5} dot={false} strokeDasharray="4 3" name="cost" />
                  <Scatter dataKey="buy" fill="#34d399" name="buy" />
                  <Scatter dataKey="sell" fill="#f43f5e" name="sell" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* 거래 장부 */}
            <div className="panel overflow-hidden">
              <div className="px-5 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
                <h3 className="text-[11px] font-semibold tracking-wider uppercase text-white">거래 장부 (체결)</h3>
                <span className="text-[10px] text-[var(--text-mute)]">최신순 {data?.transactions.length}건</span>
              </div>
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="sticky top-0 bg-[var(--surface-2)]">
                    <tr>{["날짜", "종목", "구분", "수량", "체결단가", "금액", "수수료/세금"].map((h) => <th key={h} className="px-4 py-2 text-[10px] text-[var(--text-mute)] text-left font-medium uppercase tracking-wider">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {data?.transactions.map((t, i) => (
                      <tr key={i} className="border-t border-[var(--border)] hover:bg-white/[0.02]">
                        <td className="px-4 py-2 text-xs text-[var(--text-dim)] font-mono">{t.date}</td>
                        <td className="px-4 py-2"><Link href={`/market?symbol=${t.symbol}`} className="text-xs text-white font-medium hover:text-violet-300">{t.symbol}</Link> <span className="text-[10px] text-[var(--text-mute)]">{t.currency}</span></td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${t.side === "BUY" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                            {t.side === "BUY" ? <ArrowDownCircle className="w-3 h-3" /> : <ArrowUpCircle className="w-3 h-3" />}{t.side === "BUY" ? "매수" : "매도"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs tabular-nums text-[var(--text-dim)]">{t.quantity < 1 ? t.quantity.toFixed(6) : formatNumber(t.quantity, t.quantity % 1 === 0 ? 0 : 4)}</td>
                        <td className="px-4 py-2 text-xs tabular-nums text-[var(--text-dim)]">{fmtNative(t)}</td>
                        <td className="px-4 py-2 text-xs tabular-nums text-white">{t.currency === "USD" ? `$${formatNumber(t.amount, 2)}` : `₩${formatNumber(t.amount, 0)}`}</td>
                        <td className="px-4 py-2 text-xs tabular-nums text-[var(--text-mute)]">{t.commission + t.tax > 0 ? (t.currency === "USD" ? `$${formatNumber(t.commission + t.tax, 2)}` : `₩${formatNumber(t.commission + t.tax, 0)}`) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="panel p-12 text-center text-[var(--text-mute)] text-sm">체결된 거래내역이 없습니다</div>
        )}
      </div>
    </div>
  );
}
