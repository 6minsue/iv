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

const PRESETS = ["005930", "000660", "035420", "035720", "AAPL", "NVDA", "TSLA"];

const toneColor: Record<SignalTone, string> = {
  bullish: "text-rose-400",
  bearish: "text-blue-400",
  neutral: "text-slate-400",
};
const toneBg: Record<SignalTone, string> = {
  bullish: "bg-rose-500/10 border-rose-500/20",
  bearish: "bg-blue-500/10 border-blue-500/20",
  neutral: "bg-white/[0.03] border-[var(--border)]",
};
const toneLabel: Record<SignalTone, string> = { bullish: "매수", bearish: "매도", neutral: "중립" };

const axisT = { tick: { fill: "#5b6577", fontSize: 10 }, tickLine: false, axisLine: false } as const;
const gridEl = <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />;
const tooltipStyle = {
  contentStyle: { background: "#131826", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12, color: "#e6e9f0" },
  labelStyle: { color: "#9aa4b8", fontSize: 11 },
};

export default function SignalsPage() {
  const [symbol, setSymbol] = useState("005930");
  const [input, setInput] = useState("005930");
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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(symbol, interval); }, [symbol, interval, load]);

  const submit = () => {
    const s = input.trim().toUpperCase();
    if (s) setSymbol(s);
  };

  const isUS = !/^\d{6}$/.test(symbol);
  const score = composite?.score ?? 0;
  const markerPos = ((score + 100) / 200) * 100;
  const scoreColor = score >= 15 ? "text-rose-400" : score <= -15 ? "text-blue-400" : "text-slate-300";
  const priceColor = isUS ? "#e6e9f0" : "#e6e9f0";

  return (
    <div className="min-h-screen">
      <Header title="시그널 · 분석" />
      <div className="p-6 space-y-5 max-w-6xl mx-auto w-full">

        {/* 검색 + 주기 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-mute)]" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="종목코드 (005930, AAPL)"
              className="w-full panel-2 pl-9 pr-3 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-violet-400"
            />
          </div>
          <div className="flex gap-1 p-1 bg-white/[0.04] rounded-lg">
            {[["1d", "일봉"], ["1w", "주봉"]].map(([iv, label]) => (
              <button key={iv} onClick={() => setInterval(iv)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${interval === iv ? "bg-white/[0.08] text-white" : "text-[var(--text-dim)]"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 프리셋 */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((s) => (
            <button key={s} onClick={() => { setInput(s); setSymbol(s); }}
              className={`px-3 py-1 text-xs rounded-full border transition-colors font-mono ${symbol === s ? "bg-violet-500/20 text-violet-200 border-violet-500/40" : "panel-2 text-[var(--text-dim)] hover:border-[var(--border-strong)]"}`}>
              {s}
            </button>
          ))}
        </div>

        {error && <div className="panel p-4 text-amber-400 text-sm">{error}</div>}

        {loading ? (
          <div className="h-40 panel animate-pulse" />
        ) : composite ? (
          <>
            {/* 종합 게이지 */}
            <div className="panel p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center glow">
                    <Gauge className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-mute)] font-mono">{composite.symbol}</p>
                    <p className="text-lg font-bold text-white">
                      {isUS ? `$${formatNumber(composite.price, 2)}` : `${formatNumber(composite.price)}원`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-3xl font-bold ${scoreColor}`}>{composite.label}</p>
                  <p className="text-sm text-[var(--text-mute)] tabular-nums">종합점수 {score > 0 ? "+" : ""}{score}</p>
                </div>
              </div>

              <div className="relative h-3 rounded-full bg-gradient-to-r from-blue-500 via-slate-600 to-rose-500 mb-2">
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-[#f1f5f9] border-2 border-[#0a0d14] rounded-full shadow-md transition-all"
                  style={{ left: `${markerPos}%` }} />
              </div>
              <div className="flex justify-between text-xs text-[var(--text-mute)] mb-5">
                <span>강한 매도</span><span>중립</span><span>강한 매수</span>
              </div>

              <div className="flex gap-3">
                {[
                  { label: "매수", count: composite.bullish, color: "bg-rose-500/10 text-rose-400", icon: TrendingUp },
                  { label: "중립", count: composite.neutral, color: "bg-white/[0.04] text-slate-300", icon: Minus },
                  { label: "매도", count: composite.bearish, color: "bg-blue-500/10 text-blue-400", icon: TrendingDown },
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
                    <span className="text-xs text-[var(--text-dim)] font-medium">{ind.label}</span>
                    <span className={`text-xs font-semibold ${toneColor[ind.tone]}`}>{toneLabel[ind.tone]}</span>
                  </div>
                  <p className={`text-lg font-bold tabular-nums ${toneColor[ind.tone]}`}>{ind.value}</p>
                  <p className="text-xs text-[var(--text-mute)] mt-0.5 leading-snug">{ind.detail}</p>
                </div>
              ))}
            </div>

            {/* 가격 + 볼린저 + 이평 */}
            <div className="panel p-5">
              <div className="flex items-center gap-4 mb-4 text-xs">
                <h3 className="text-sm font-semibold text-white">가격 · 볼린저밴드 · 이동평균</h3>
                <span className="flex items-center gap-1 text-[var(--text-mute)]"><span className="w-3 h-0.5 bg-slate-200 inline-block" />종가</span>
                <span className="flex items-center gap-1 text-[var(--text-mute)]"><span className="w-3 h-0.5 bg-amber-400 inline-block" />SMA20</span>
                <span className="flex items-center gap-1 text-[var(--text-mute)]"><span className="w-3 h-0.5 bg-cyan-400 inline-block" />SMA60</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  {gridEl}
                  <XAxis dataKey="time" {...axisT} minTickGap={40} tickFormatter={(v) => String(v).slice(5, 10)} />
                  <YAxis {...axisT} width={56} domain={["auto", "auto"]} tickFormatter={(v) => isUS ? `$${v}` : formatNumber(v)} />
                  <Tooltip {...tooltipStyle} formatter={(v: unknown, n) => [typeof v === "number" ? (isUS ? `$${v.toFixed(2)}` : formatNumber(v)) : "-", String(n)]} />
                  <Line dataKey="upper" stroke="#7c6cff" strokeWidth={1} dot={false} strokeDasharray="3 3" name="상단" connectNulls />
                  <Line dataKey="lower" stroke="#7c6cff" strokeWidth={1} dot={false} strokeDasharray="3 3" name="하단" connectNulls />
                  <Line dataKey="sma60" stroke="#22d3ee" strokeWidth={1.5} dot={false} name="SMA60" connectNulls />
                  <Line dataKey="sma20" stroke="#fbbf24" strokeWidth={1.5} dot={false} name="SMA20" connectNulls />
                  <Line dataKey="close" stroke={priceColor} strokeWidth={1.8} dot={false} name="종가" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* RSI + MACD */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="panel p-5">
                <h3 className="text-sm font-semibold text-white mb-4">RSI (14)</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    {gridEl}
                    <XAxis dataKey="time" {...axisT} minTickGap={40} tickFormatter={(v) => String(v).slice(5, 10)} />
                    <YAxis domain={[0, 100]} {...axisT} width={28} />
                    <Tooltip {...tooltipStyle} formatter={(v: unknown) => [typeof v === "number" ? v.toFixed(1) : "-", "RSI"]} />
                    <ReferenceLine y={70} stroke="#fb7185" strokeDasharray="4 2" strokeOpacity={0.4} />
                    <ReferenceLine y={30} stroke="#60a5fa" strokeDasharray="4 2" strokeOpacity={0.4} />
                    <Line dataKey="rsi" stroke="#34d399" strokeWidth={1.5} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="panel p-5">
                <h3 className="text-sm font-semibold text-white mb-4">MACD 히스토그램</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    {gridEl}
                    <XAxis dataKey="time" {...axisT} minTickGap={40} tickFormatter={(v) => String(v).slice(5, 10)} />
                    <YAxis {...axisT} width={40} />
                    <Tooltip {...tooltipStyle} formatter={(v: unknown) => [typeof v === "number" ? v.toFixed(3) : "-", "Hist"]} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                    <Bar dataKey="macdHist" name="Hist">
                      {series.map((s, i) => (
                        <Cell key={i} fill={(s.macdHist ?? 0) >= 0 ? "#fb7185" : "#60a5fa"} />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        ) : (
          <div className="panel p-12 text-center text-[var(--text-mute)] text-sm">데이터가 없습니다</div>
        )}
      </div>
    </div>
  );
}
