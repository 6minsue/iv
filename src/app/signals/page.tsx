"use client";

import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import { formatNumber } from "@/lib/utils";
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { Gauge, Search, TrendingUp, TrendingDown, Minus } from "lucide-react";

type SignalTone = "bullish" | "bearish" | "neutral";

interface IndicatorSignal {
  key: string;
  label: string;
  value: string;
  tone: SignalTone;
  detail: string;
  weight: number;
}

interface Composite {
  symbol: string;
  asOf: string;
  price: number;
  score: number;
  label: string;
  bullish: number;
  bearish: number;
  neutral: number;
  indicators: IndicatorSignal[];
}

interface SeriesPoint {
  time: string;
  close: number;
  sma20: number | null;
  sma60: number | null;
  upper: number | null;
  lower: number | null;
  rsi: number | null;
  macdHist: number | null;
}

const PRESETS = ["AAPL", "NVDA", "MSFT", "TSLA", "GOOGL", "AMZN", "META", "005930"];

const toneColor: Record<SignalTone, string> = {
  bullish: "text-red-500",
  bearish: "text-blue-500",
  neutral: "text-slate-400",
};
const toneBg: Record<SignalTone, string> = {
  bullish: "bg-red-50 border-red-100",
  bearish: "bg-blue-50 border-blue-100",
  neutral: "bg-slate-50 border-slate-200",
};
const toneLabel: Record<SignalTone, string> = { bullish: "매수", bearish: "매도", neutral: "중립" };

export default function SignalsPage() {
  const [symbol, setSymbol] = useState("AAPL");
  const [input, setInput] = useState("AAPL");
  const [interval, setInterval] = useState("1d");
  const [composite, setComposite] = useState<Composite | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((sym: string, iv: string) => {
    setLoading(true);
    setError(null);
    fetch(`/api/quant/signals?symbol=${sym}&interval=${iv}&count=200`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error && !d.composite) setError(d.error);
        setComposite(d.composite ?? null);
        setSeries(d.series ?? []);
      })
      .catch(() => setError("데이터를 불러올 수 없습니다"))
      .finally(() => setLoading(false));
  }, []);

  // 종목/주기 변경 시 데이터 패칭 (외부 시스템 동기화 목적의 정당한 effect)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(symbol, interval); }, [symbol, interval, load]);

  const submit = () => {
    const s = input.trim().toUpperCase();
    if (s) setSymbol(s);
  };

  const isUS = !/^\d{6}$/.test(symbol);
  const score = composite?.score ?? 0;
  // 게이지 마커 위치 (-100..100 → 0..100%)
  const markerPos = ((score + 100) / 200) * 100;
  const scoreColor = score >= 15 ? "text-red-500" : score <= -15 ? "text-blue-500" : "text-slate-500";

  const tooltipStyle = {
    contentStyle: { backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" },
    labelStyle: { color: "#64748b", fontSize: 11 },
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header title="기술적 시그널" />
      <div className="p-6 space-y-5 max-w-6xl mx-auto w-full">

        {/* 검색 + 주기 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="종목코드 (AAPL, 005930)"
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-400 shadow-sm"
            />
          </div>
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
            {[["1d", "일봉"], ["1w", "주봉"], ["1h", "1시간"]].map(([iv, label]) => (
              <button key={iv} onClick={() => setInterval(iv)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${interval === iv ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 프리셋 */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((s) => (
            <button key={s} onClick={() => { setInput(s); setSymbol(s); }}
              className={`px-3 py-1 text-xs rounded-full border transition-colors font-mono ${symbol === s ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
              {s}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-700 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="h-40 bg-white border border-slate-200 rounded-xl animate-pulse shadow-sm" />
        ) : composite ? (
          <>
            {/* 종합 게이지 */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-md">
                    <Gauge className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-mono">{composite.symbol}</p>
                    <p className="text-lg font-bold text-slate-900">
                      {isUS ? `$${formatNumber(composite.price, 2)}` : `${formatNumber(composite.price)}원`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-3xl font-bold ${scoreColor}`}>{composite.label}</p>
                  <p className="text-sm text-slate-400 tabular-nums">종합점수 {score > 0 ? "+" : ""}{score}</p>
                </div>
              </div>

              {/* 게이지 바 */}
              <div className="relative h-3 rounded-full bg-gradient-to-r from-blue-400 via-slate-200 to-red-400 mb-2">
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-white border-2 border-slate-700 rounded-full shadow-md transition-all"
                  style={{ left: `${markerPos}%` }} />
              </div>
              <div className="flex justify-between text-xs text-slate-400 mb-5">
                <span>강한 매도</span><span>중립</span><span>강한 매수</span>
              </div>

              <div className="flex gap-3">
                {[
                  { label: "매수", count: composite.bullish, color: "bg-red-50 text-red-500", icon: TrendingUp },
                  { label: "중립", count: composite.neutral, color: "bg-slate-50 text-slate-500", icon: Minus },
                  { label: "매도", count: composite.bearish, color: "bg-blue-50 text-blue-500", icon: TrendingDown },
                ].map(({ label, count, color, icon: Icon }) => (
                  <div key={label} className={`flex-1 rounded-lg p-3 flex items-center justify-center gap-2 ${color}`}>
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-semibold">{label} {count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 지표 카드 그리드 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {composite.indicators.map((ind) => (
                <div key={ind.key} className={`border rounded-xl p-4 ${toneBg[ind.tone]}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-500 font-medium">{ind.label}</span>
                    <span className={`text-xs font-semibold ${toneColor[ind.tone]}`}>{toneLabel[ind.tone]}</span>
                  </div>
                  <p className={`text-lg font-bold tabular-nums ${toneColor[ind.tone]}`}>{ind.value}</p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-snug">{ind.detail}</p>
                </div>
              ))}
            </div>

            {/* 가격 + 볼린저 + 이평 */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-4 mb-4 text-xs">
                <h3 className="text-sm font-semibold text-slate-700">가격 · 볼린저밴드 · 이동평균</h3>
                <span className="flex items-center gap-1 text-slate-400"><span className="w-3 h-0.5 bg-slate-800 inline-block" />종가</span>
                <span className="flex items-center gap-1 text-slate-400"><span className="w-3 h-0.5 bg-amber-500 inline-block" />SMA20</span>
                <span className="flex items-center gap-1 text-slate-400"><span className="w-3 h-0.5 bg-cyan-500 inline-block" />SMA60</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(v) => String(v).slice(5, 10)} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} width={56} domain={["auto", "auto"]} tickFormatter={(v) => isUS ? `$${v}` : formatNumber(v)} />
                  <Tooltip {...tooltipStyle} formatter={(v: unknown, n) => [typeof v === "number" ? (isUS ? `$${v.toFixed(2)}` : formatNumber(v)) : "-", String(n)]} />
                  <Line dataKey="upper" stroke="#c4b5fd" strokeWidth={1} dot={false} strokeDasharray="3 3" name="상단" connectNulls />
                  <Line dataKey="lower" stroke="#c4b5fd" strokeWidth={1} dot={false} strokeDasharray="3 3" name="하단" connectNulls />
                  <Line dataKey="sma60" stroke="#06b6d4" strokeWidth={1.5} dot={false} name="SMA60" connectNulls />
                  <Line dataKey="sma20" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="SMA20" connectNulls />
                  <Line dataKey="close" stroke="#0f172a" strokeWidth={1.5} dot={false} name="종가" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* RSI + MACD */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">RSI (14)</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(v) => String(v).slice(5, 10)} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
                    <Tooltip {...tooltipStyle} formatter={(v: unknown) => [typeof v === "number" ? v.toFixed(1) : "-", "RSI"]} />
                    <ReferenceLine y={70} stroke="#f43f5e" strokeDasharray="4 2" strokeOpacity={0.4} />
                    <ReferenceLine y={30} stroke="#60a5fa" strokeDasharray="4 2" strokeOpacity={0.4} />
                    <Line dataKey="rsi" stroke="#10b981" strokeWidth={1.5} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">MACD 히스토그램</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(v) => String(v).slice(5, 10)} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                    <Tooltip {...tooltipStyle} formatter={(v: unknown) => [typeof v === "number" ? v.toFixed(3) : "-", "Hist"]} />
                    <ReferenceLine y={0} stroke="#cbd5e1" />
                    <Bar dataKey="macdHist" name="Hist">
                      {series.map((s, i) => (
                        <Cell key={i} fill={(s.macdHist ?? 0) >= 0 ? "#f87171" : "#60a5fa"} />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm shadow-sm">
            데이터가 없습니다
          </div>
        )}
      </div>
    </div>
  );
}
