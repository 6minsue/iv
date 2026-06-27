"use client";

import { useEffect, useRef, useState } from "react";
import { extractArray } from "@/lib/parse";
import { formatNumber } from "@/lib/utils";

interface OrderEntry {
  price: number;
  volume: number;
}

interface OrderBookData {
  asks: OrderEntry[];
  bids: OrderEntry[];
}

export default function OrderBook({ symbol }: { symbol: string }) {
  const [data, setData] = useState<OrderBookData | null>(null);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<number | null>(null);

  const fetchBook = async (isFirst = false) => {
    if (isFirst) setLoading(true);
    try {
      const r = await fetch(`/api/orderbook?symbol=${symbol}`);
      const d = await r.json();
      const asks = extractArray<Record<string, number>>(d, "asks", "askPrices").map((x) => ({
        price: x.price ?? x.askPrice ?? 0,
        volume: x.volume ?? x.quantity ?? x.askQuantity ?? 0,
      }));
      const bids = extractArray<Record<string, number>>(d, "bids", "bidPrices").map((x) => ({
        price: x.price ?? x.bidPrice ?? 0,
        volume: x.volume ?? x.quantity ?? x.bidQuantity ?? 0,
      }));
      setData({ asks: asks.slice(0, 8).reverse(), bids: bids.slice(0, 8) });
    } catch {
      if (isFirst) setData(null);
    } finally {
      if (isFirst) setLoading(false);
    }
  };

  useEffect(() => {
    if (pollingRef.current) window.clearInterval(pollingRef.current);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    fetchBook(true);
    pollingRef.current = window.setInterval(() => fetchBook(false), 5000);
    return () => { if (pollingRef.current) window.clearInterval(pollingRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  if (loading) {
    return <div className="h-48 flex items-center justify-center text-slate-400 text-sm animate-pulse">불러오는 중...</div>;
  }
  if (!data || (data.asks.length === 0 && data.bids.length === 0)) {
    return <div className="h-24 flex items-center justify-center text-slate-400 text-sm">호가 정보 없음</div>;
  }

  const isUS = !/^\d{6}$/.test(symbol);
  const fmt = (v: number) => isUS ? `$${formatNumber(v, 2)}` : formatNumber(v);
  const fmtVol = (v: number) => isUS ? formatNumber(v, 4) : formatNumber(v, 0);
  const maxVol = Math.max(...[...data.asks, ...data.bids].map((x) => x.volume), 1);

  return (
    <div className="text-xs font-mono">
      <div className="grid grid-cols-3 text-slate-400 mb-1 px-1 font-sans text-xs">
        <span>잔량</span>
        <span className="text-center">가격</span>
        <span className="text-right">잔량</span>
      </div>
      {data.asks.map((ask, i) => (
        <div key={i} className="grid grid-cols-3 items-center py-0.5 px-1 relative">
          <div
            className="absolute right-1/2 top-0 bottom-0 bg-blue-100 rounded"
            style={{ width: `${(ask.volume / maxVol) * 46}%` }}
          />
          <span className="text-slate-500 text-right pr-2 relative z-10">{fmtVol(ask.volume)}</span>
          <span className="text-blue-600 text-center font-semibold relative z-10">{fmt(ask.price)}</span>
          <span />
        </div>
      ))}
      <div className="border-t border-slate-200 my-1.5" />
      {data.bids.map((bid, i) => (
        <div key={i} className="grid grid-cols-3 items-center py-0.5 px-1 relative">
          <div
            className="absolute left-1/2 top-0 bottom-0 bg-red-100 rounded"
            style={{ width: `${(bid.volume / maxVol) * 46}%` }}
          />
          <span />
          <span className="text-red-500 text-center font-semibold relative z-10">{fmt(bid.price)}</span>
          <span className="text-slate-500 pl-2 relative z-10">{fmtVol(bid.volume)}</span>
        </div>
      ))}
    </div>
  );
}
