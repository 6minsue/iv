"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { useAppStore } from "@/store/useAppStore";
import { extractArray } from "@/lib/parse";
import { formatNumber, priceColor } from "@/lib/utils";
import { Plus, X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import Link from "next/link";

interface PriceData {
  symbol: string;
  symbolName: string;
  currentPrice: number;
  changePrice: number;
  changeRate: number;
  volume: number;
  highPrice: number;
  lowPrice: number;
}

export default function WatchlistPage() {
  const { watchlist, addToWatchlist, removeFromWatchlist } = useAppStore();
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSymbol, setNewSymbol] = useState("");

  useEffect(() => {
    if (watchlist.length === 0) { setLoading(false); return; }
    setLoading(true);
    fetch(`/api/prices?symbols=${watchlist.join(",")}`)
      .then((r) => r.json())
      .then((d) => setPrices(extractArray<PriceData>(d, "prices", "data", "items")))
      .catch(() => setPrices([]))
      .finally(() => setLoading(false));
  }, [watchlist]);

  const add = () => {
    const s = newSymbol.trim().toUpperCase();
    if (s) { addToWatchlist(s); setNewSymbol(""); }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header title="관심종목" />
      <div className="p-6 space-y-5 max-w-6xl mx-auto w-full">

        {/* 추가 폼 */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="종목코드 입력 (예: AAPL, 005930)"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            className="flex-1 bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-400 placeholder-slate-400 max-w-sm shadow-sm"
          />
          <button
            onClick={add}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            추가
          </button>
        </div>

        {/* 테이블 */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {["종목", "현재가", "등락", "등락률", "고가", "저가", "거래량", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs text-slate-500 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                watchlist.map((s) => (
                  <tr key={s} className="border-b border-slate-100">
                    <td className="px-4 py-4" colSpan={8}>
                      <div className="h-4 bg-slate-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : prices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-sm">
                    관심 종목을 추가해보세요
                  </td>
                </tr>
              ) : (
                prices.map((p) => {
                  const cp = p.changePrice ?? 0;
                  const color = priceColor(cp);
                  const Icon = cp > 0 ? TrendingUp : cp < 0 ? TrendingDown : Minus;
                  const isUS = !/^\d{6}$/.test(p.symbol);
                  const fmt = (v: number) => isUS ? `$${formatNumber(v, 2)}` : formatNumber(v);
                  return (
                    <tr key={p.symbol} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-3">
                        <Link href={`/market?symbol=${p.symbol}`} className="hover:text-blue-500 transition-colors">
                          <p className="text-slate-800 font-semibold">{p.symbolName ?? p.symbol}</p>
                          <p className="text-xs text-slate-400 font-mono">{p.symbol}</p>
                        </Link>
                      </td>
                      <td className="px-4 py-3 tabular-nums font-bold text-slate-900">{fmt(p.currentPrice ?? 0)}</td>
                      <td className={`px-4 py-3 tabular-nums font-semibold ${color}`}>
                        <span className="flex items-center gap-1">
                          <Icon className="w-3 h-3" />
                          {cp >= 0 ? "+" : ""}{fmt(cp)}
                        </span>
                      </td>
                      <td className={`px-4 py-3 tabular-nums font-semibold ${color}`}>
                        {(p.changeRate ?? 0) >= 0 ? "+" : ""}{(p.changeRate ?? 0).toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">{fmt(p.highPrice ?? 0)}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">{fmt(p.lowPrice ?? 0)}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-400">{formatNumber(p.volume ?? 0)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => removeFromWatchlist(p.symbol)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 text-slate-300 transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
