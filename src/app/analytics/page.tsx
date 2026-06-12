"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { extractArray } from "@/lib/parse";
import { formatNumber } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, ReferenceLine
} from "recharts";

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function calcMA(candles: Candle[], period: number): (number | null)[] {
  return candles.map((_, i) => {
    if (i < period - 1) return null;
    const slice = candles.slice(i - period + 1, i + 1);
    return slice.reduce((s, c) => s + c.close, 0) / period;
  });
}

function calcRSI(candles: Candle[], period = 14): (number | null)[] {
  const result: (number | null)[] = Array(candles.length).fill(null);
  if (candles.length < period + 1) return result;
  for (let i = period; i < candles.length; i++) {
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = candles[j].close - candles[j - 1].close;
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const rs = losses === 0 ? 100 : gains / losses;
    result[i] = 100 - 100 / (1 + rs);
  }
  return result;
}

const SYMBOLS = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "NVDA", name: "Nvidia" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "GOOGL", name: "Alphabet" },
];

export default function AnalyticsPage() {
  const [symbol, setSymbol] = useState("AAPL");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/candles?symbol=${symbol}&interval=1d&count=120`)
      .then((r) => r.json())
      .then((d) => {
        const raw = extractArray<Record<string, unknown>>(d, "candles", "data", "items");
        setCandles(
          raw.map((c) => ({
            time: String(c.time ?? c.date ?? ""),
            open: Number(c.openPrice ?? c.open),
            high: Number(c.highPrice ?? c.high),
            low: Number(c.lowPrice ?? c.low),
            close: Number(c.closePrice ?? c.close),
            volume: Number(c.volume),
          }))
        );
      })
      .catch(() => setCandles([]))
      .finally(() => setLoading(false));
  }, [symbol]);

  const ma5 = calcMA(candles, 5);
  const ma20 = calcMA(candles, 20);
  const ma60 = calcMA(candles, 60);
  const rsi = calcRSI(candles, 14);

  const chartData = candles.map((c, i) => ({
    time: c.time?.slice(0, 10) ?? "",
    close: c.close,
    volume: c.volume,
    ma5: ma5[i],
    ma20: ma20[i],
    ma60: ma60[i],
    rsi: rsi[i],
  }));

  const last = candles[candles.length - 1];
  const lastRsi = rsi[rsi.length - 1];
  const isUS = !/^\d{6}$/.test(symbol);
  const fmt = (v: number | null | undefined) =>
    v == null ? "-" : isUS ? `$${formatNumber(v, 2)}` : formatNumber(v);

  const tooltipStyle = {
    contentStyle: { backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" },
    itemStyle: { color: "#0f172a", fontSize: 12 },
    labelStyle: { color: "#64748b", fontSize: 12 },
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header title="기술 분석" />
      <div className="p-6 space-y-5 max-w-6xl mx-auto w-full">

        {/* 종목 선택 */}
        <div className="flex flex-wrap gap-2">
          {SYMBOLS.map((s) => (
            <button
              key={s.symbol}
              onClick={() => setSymbol(s.symbol)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm ${
                symbol === s.symbol
                  ? "bg-blue-500 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* 지표 요약 */}
        {last && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: "현재가", value: fmt(last.close), color: "text-slate-900" },
              { label: "MA5", value: fmt(ma5[ma5.length - 1]), color: last.close > (ma5[ma5.length - 1] ?? 0) ? "text-red-500" : "text-blue-500" },
              { label: "MA20", value: fmt(ma20[ma20.length - 1]), color: last.close > (ma20[ma20.length - 1] ?? 0) ? "text-red-500" : "text-blue-500" },
              { label: "MA60", value: fmt(ma60[ma60.length - 1]), color: last.close > (ma60[ma60.length - 1] ?? 0) ? "text-red-500" : "text-blue-500" },
              {
                label: "RSI(14)",
                value: lastRsi ? lastRsi.toFixed(1) : "-",
                color: !lastRsi ? "text-slate-400" : lastRsi > 70 ? "text-red-500" : lastRsi < 30 ? "text-blue-500" : "text-emerald-500",
              },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-xs text-slate-400 mb-1 font-medium">{label}</p>
                <p className={`text-base font-bold tabular-nums ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse shadow-sm" />
        ) : candles.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm shadow-sm">
            캔들 데이터를 불러올 수 없습니다
          </div>
        ) : (
          <>
            {/* 이동평균선 차트 */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">이동평균선</h3>
              <div className="flex gap-4 text-xs mb-3">
                {[["MA5", "#f59e0b"], ["MA20", "#6366f1"], ["MA60", "#06b6d4"]].map(([label, color]) => (
                  <span key={label} className="flex items-center gap-1.5 text-slate-500">
                    <span className="w-6 h-0.5 rounded" style={{ backgroundColor: color, display: "inline-block" }} />
                    {label}
                  </span>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => v.slice(5)} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => isUS ? `$${v}` : v.toLocaleString()} width={64} />
                  <Tooltip {...tooltipStyle} formatter={(v: unknown) => typeof v === "number" && v ? [isUS ? `$${v.toFixed(2)}` : v.toLocaleString(), ""] : ["-", ""]} />
                  <Line dataKey="close" stroke="#0f172a" strokeWidth={1.5} dot={false} name="종가" />
                  <Line dataKey="ma5" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="MA5" connectNulls />
                  <Line dataKey="ma20" stroke="#6366f1" strokeWidth={1.5} dot={false} name="MA20" connectNulls />
                  <Line dataKey="ma60" stroke="#06b6d4" strokeWidth={1.5} dot={false} name="MA60" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* RSI 차트 */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">RSI (14)</h3>
                <div className="flex gap-3 text-xs text-slate-400">
                  <span className="text-red-400">과매수 &gt;70</span>
                  <span className="text-blue-400">과매도 &lt;30</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => v.slice(5)} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip {...tooltipStyle} formatter={(v: unknown) => typeof v === "number" && v ? [v.toFixed(1), "RSI"] : ["-", "RSI"]} />
                  <ReferenceLine y={70} stroke="#f43f5e" strokeDasharray="4 2" strokeOpacity={0.4} />
                  <ReferenceLine y={30} stroke="#60a5fa" strokeDasharray="4 2" strokeOpacity={0.4} />
                  <ReferenceLine y={50} stroke="#cbd5e1" strokeDasharray="2 2" strokeOpacity={0.6} />
                  <Line dataKey="rsi" stroke="#10b981" strokeWidth={1.5} dot={false} name="RSI" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* 거래량 차트 */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">거래량</h3>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => v.slice(5)} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${(v / 1000000).toFixed(0)}M`} />
                  <Tooltip {...tooltipStyle} formatter={(v: unknown) => [typeof v === "number" ? v.toLocaleString() : "-", "거래량"]} />
                  <Bar dataKey="volume" fill="#6366f1" opacity={0.6} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
