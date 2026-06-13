"use client";

import { formatNumber, priceColor } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changeRate: number;
  volume?: number;
  onClick?: () => void;
}

export default function PriceCard({ symbol, name, price, change, changeRate, volume, onClick }: Props) {
  const color = priceColor(change);
  const Icon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  const isUS = !/^\d{6}$/.test(symbol);

  return (
    <div
      className="panel p-4 cursor-pointer hover:border-violet-400/40 hover:bg-white/[0.02] transition-all group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <p className="text-xs text-[var(--text-mute)] font-mono">{symbol}</p>
          <p className="text-sm text-slate-200 font-semibold mt-0.5 truncate max-w-[110px]">{name}</p>
        </div>
        <div className={`p-1.5 rounded-lg ${change > 0 ? "bg-rose-500/10" : change < 0 ? "bg-blue-500/10" : "bg-white/5"}`}>
          <Icon className={`w-3.5 h-3.5 ${color}`} />
        </div>
      </div>
      <p className="text-xl font-bold text-white tabular-nums">
        {isUS ? "$" : ""}{formatNumber(price, isUS ? 2 : 0)}
        {!isUS && <span className="text-xs text-[var(--text-mute)] ml-1">원</span>}
      </p>
      <div className="flex items-center gap-2 mt-1">
        <span className={`text-xs font-semibold tabular-nums ${color}`}>
          {change >= 0 ? "+" : ""}{formatNumber(change, isUS ? 2 : 0)}
        </span>
        <span className={`text-xs tabular-nums ${color}`}>
          ({changeRate >= 0 ? "+" : ""}{changeRate.toFixed(2)}%)
        </span>
      </div>
      {volume !== undefined && (
        <p className="text-xs text-[var(--text-mute)] mt-2">{formatNumber(volume)}</p>
      )}
    </div>
  );
}
