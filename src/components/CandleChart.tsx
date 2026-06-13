"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Line,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { format, parseISO } from "date-fns";

export type ChartInterval = "1m" | "5m" | "15m" | "1d" | "1w";

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Props {
  symbol: string;
  interval?: ChartInterval;
  count?: number;
}

const DEFAULT_COUNTS: Record<ChartInterval, number> = {
  "1m":  60,
  "5m":  70,
  "15m": 60,
  "1d":  120,
  "1w":  60,
};

function formatTime(timeStr: string, interval: ChartInterval): string {
  try {
    const d = parseISO(timeStr);
    if (interval === "1d" || interval === "1w") return format(d, "MM/dd");
    return format(d, "HH:mm");
  } catch {
    return timeStr?.slice(5, 10) ?? "";
  }
}

export default function CandleChart({ symbol, interval = "1d", count }: Props) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  const effectiveCount = count ?? DEFAULT_COUNTS[interval];

  useEffect(() => {
    setLoading(true);
    setCandles([]);
    fetch(`/api/candles?symbol=${symbol}&interval=${interval}&count=${effectiveCount}`)
      .then((r) => r.json())
      .then((d) => {
        const raw: Candle[] = ((d.candles ?? []) as Candle[]).filter((c) => c.close > 0);
        raw.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        setCandles(raw);
      })
      .catch(() => setCandles([]))
      .finally(() => setLoading(false));
  }, [symbol, interval, effectiveCount]);

  if (loading) {
    return (
      <div className="h-72 flex items-center justify-center text-slate-400 text-sm animate-pulse">
        차트 불러오는 중...
      </div>
    );
  }
  if (candles.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-slate-400 text-sm">
        차트 데이터 없음
      </div>
    );
  }

  const isUS = !/^\d{6}$/.test(symbol);
  const last = candles[candles.length - 1];
  const first = candles[0];
  const periodChange = ((last.close - first.close) / first.close) * 100;
  const minPrice = Math.min(...candles.map((c) => c.low)) * 0.998;
  const maxPrice = Math.max(...candles.map((c) => c.high)) * 1.002;

  const chartData = candles.map((c) => ({
    time: c.time,
    timeLabel: formatTime(c.time, interval),
    close: c.close,
    open: c.open,
    high: c.high,
    low: c.low,
    volume: c.volume,
  }));

  const fmtPrice = (v: number) => isUS ? `$${v.toFixed(2)}` : v.toLocaleString("ko-KR");

  const TooltipContent = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ value: number; payload: (typeof chartData)[0] }>;
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const chg = d.close - d.open;
    const chgPct = d.open > 0 ? (chg / d.open) * 100 : 0;
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs min-w-[150px]">
        <p className="text-slate-500 mb-2 font-medium">{label}</p>
        <div className="space-y-1">
          {[
            ["시가", d.open, "text-slate-700"],
            ["고가", d.high, "text-red-500"],
            ["저가", d.low, "text-blue-500"],
            ["종가", d.close, "text-slate-900 font-semibold"],
          ].map(([lbl, val, cls]) => (
            <div key={String(lbl)} className="flex justify-between gap-4">
              <span className="text-slate-400">{lbl}</span>
              <span className={`font-mono ${cls}`}>{fmtPrice(Number(val))}</span>
            </div>
          ))}
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">변동</span>
            <span className={`font-mono ${chg >= 0 ? "text-red-500" : "text-blue-500"}`}>
              {chg >= 0 ? "+" : ""}{fmtPrice(chg)} ({chgPct >= 0 ? "+" : ""}{chgPct.toFixed(2)}%)
            </span>
          </div>
          <div className="border-t border-slate-100 mt-1 pt-1 flex justify-between gap-4">
            <span className="text-slate-400">거래량</span>
            <span className="font-mono text-slate-600">{d.volume.toLocaleString()}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-xs text-slate-400">
        <span>
          {formatTime(first.time, interval)} ~ {formatTime(last.time, interval)}
          <span className="ml-2 text-slate-300">({candles.length}봉)</span>
        </span>
        <span className={`font-semibold ${periodChange >= 0 ? "text-red-500" : "text-blue-500"}`}>
          기간 {periodChange >= 0 ? "+" : ""}{periodChange.toFixed(2)}%
        </span>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="timeLabel"
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={36}
          />
          <YAxis
            domain={[minPrice, maxPrice]}
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtPrice}
            width={isUS ? 62 : 72}
          />
          <Tooltip content={<TooltipContent />} />
          <ReferenceLine
            y={last.close}
            stroke="#6366f1"
            strokeDasharray="4 3"
            strokeOpacity={0.5}
          />
          <Line
            dataKey="close"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#6366f1" }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <ResponsiveContainer width="100%" height={52}>
        <ComposedChart data={chartData} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="timeLabel" hide />
          <YAxis hide />
          <Bar dataKey="volume" fill="#6366f1" opacity={0.3} radius={[1, 1, 0, 0]} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
