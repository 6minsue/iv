"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import CandleChart, { type ChartInterval } from "@/components/CandleChart";
import OrderBook from "@/components/OrderBook";
import OrderForm from "@/components/OrderForm";
import { useAppStore } from "@/store/useAppStore";
import { extractArray } from "@/lib/parse";
import { formatNumber, priceColor } from "@/lib/utils";
import { Search, X, Clock, Star } from "lucide-react";

interface PriceData {
  symbol: string;
  symbolName: string;
  currentPrice: number;
  changePrice: number;
  changeRate: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  currency?: string;
}

interface HoldingRow {
  symbol: string;
  currency: string;
  quantity: number;
  averagePrice: number;
  marketValueNative: number;
  profitLossNative: number;
  profitLossRate: number;
}

interface StockItem {
  symbol: string;
  name: string;
}

const POPULAR_US: StockItem[] = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "NVDA", name: "Nvidia" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "META", name: "Meta" },
  { symbol: "AMD", name: "AMD" },
  { symbol: "NFLX", name: "Netflix" },
  { symbol: "ORCL", name: "Oracle" },
  { symbol: "INTC", name: "Intel" },
  { symbol: "UBER", name: "Uber" },
  { symbol: "PLTR", name: "Palantir" },
  { symbol: "COIN", name: "Coinbase" },
  { symbol: "SOFI", name: "SoFi" },
];

const POPULAR_KR: StockItem[] = [
  { symbol: "005930", name: "삼성전자" },
  { symbol: "000660", name: "SK하이닉스" },
  { symbol: "035420", name: "NAVER" },
  { symbol: "005380", name: "현대차" },
  { symbol: "051910", name: "LG화학" },
  { symbol: "035720", name: "카카오" },
  { symbol: "000270", name: "기아" },
  { symbol: "068270", name: "셀트리온" },
  { symbol: "006400", name: "삼성SDI" },
];

const INTERVALS: { label: string; value: ChartInterval }[] = [
  { label: "1분", value: "1m" },
  { label: "5분", value: "5m" },
  { label: "15분", value: "15m" },
  { label: "30분", value: "30m" },
  { label: "1H", value: "1h" },
  { label: "일봉", value: "1d" },
  { label: "주봉", value: "1w" },
];

function MarketContent() {
  const params = useSearchParams();
  const { selectedAccount } = useAppStore();

  const [symbol, setSymbol] = useState(params.get("symbol") ?? "AAPL");
  const [market, setMarket] = useState<"US" | "KR">("US");
  const [search, setSearch] = useState("");
  const [price, setPrice] = useState<PriceData | null>(null);
  const [interval, setInterval] = useState<ChartInterval>("1d");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [recent, setRecent] = useState<StockItem[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [exchangeRate, setExchangeRate] = useState(1400);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const pricePollingRef = useRef<number | null>(null);

  // 환율 1회 조회
  useEffect(() => {
    fetch("/api/exchange-rate")
      .then((r) => r.json())
      .then((d) => { if (d.rate) setExchangeRate(Number(d.rate)); })
      .catch(() => {});
  }, []);

  // 최근 조회 종목 (로컬스토리지)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("iv_recent_symbols");
      if (saved) setRecent(JSON.parse(saved));
    } catch {}
  }, []);

  // 계좌 보유 현황 조회 (계좌 변경 시)
  useEffect(() => {
    if (!selectedAccount) { setHoldings([]); return; }
    fetch(`/api/holdings?accountSeq=${selectedAccount.accountSeq}`)
      .then((r) => r.json())
      .then((d) => setHoldings(d.holdings ?? []))
      .catch(() => setHoldings([]));
  }, [selectedAccount]);

  // 전체 시세 조회 (심볼 변경 시)
  useEffect(() => {
    setLoading(true);
    fetch(`/api/prices?symbols=${symbol}`)
      .then((r) => r.json())
      .then((d) => {
        const list = extractArray<PriceData>(d, "prices", "data", "items");
        setPrice(list[0] ?? null);
      })
      .catch(() => setPrice(null))
      .finally(() => setLoading(false));
  }, [symbol]);

  // 실시간 가격 폴링 (1초 — currentPrice만 빠르게 갱신)
  useEffect(() => {
    if (pricePollingRef.current) window.clearInterval(pricePollingRef.current);
    pricePollingRef.current = window.setInterval(() => {
      fetch(`/api/prices?symbols=${symbol}&fast=1`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { prices?: Array<{ symbol: string; currentPrice: number; currency?: string }> } | null) => {
          if (!d) return;
          const list = extractArray<{ symbol: string; currentPrice: number; currency?: string }>(d, "prices");
          if (list.length > 0) {
            const p = list[0];
            setPrice((prev) =>
              prev ? { ...prev, currentPrice: p.currentPrice, currency: p.currency ?? prev.currency } : null
            );
          }
        })
        .catch(() => {});
    }, 1000);
    return () => { if (pricePollingRef.current) window.clearInterval(pricePollingRef.current); };
  }, [symbol]);

  const addRecent = (item: StockItem) => {
    setRecent((prev) => {
      const next = [item, ...prev.filter((r) => r.symbol !== item.symbol)].slice(0, 10);
      try { localStorage.setItem("iv_recent_symbols", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const lookupSymbol = async (query: string) => {
    const s = query.trim().toUpperCase();
    if (!s) return;
    setSearching(true);
    setSearchError(null);
    try {
      const r = await fetch(`/api/stocks?symbols=${s}`);
      const d = await r.json();
      const stocks = extractArray<{ symbol: string; name: string }>(d, "stocks");
      if (stocks.length > 0) {
        const found = stocks[0];
        addRecent({ symbol: found.symbol, name: found.name });
        setSymbol(found.symbol);
        setSearch("");
      } else {
        setSearchError(`"${s}" 종목을 찾을 수 없습니다`);
      }
    } catch {
      setSearchError("검색 오류");
    } finally {
      setSearching(false);
    }
  };

  const selectSymbol = (item: StockItem) => {
    setSymbol(item.symbol);
    addRecent(item);
    setSearch("");
    setSearchError(null);
  };

  const popularList = market === "US" ? POPULAR_US : POPULAR_KR;
  const filtered = search
    ? popularList.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.symbol.toLowerCase().includes(search.toLowerCase())
      )
    : popularList;

  const searchUpper = search.trim().toUpperCase();
  const isKnown = popularList.some((s) => s.symbol === searchUpper);
  const showDirectSearch = search.length >= 1 && !isKnown;

  const isUS = !/^\d{6}$/.test(symbol);
  const currency = (price?.currency ?? (isUS ? "USD" : "KRW")) as "USD" | "KRW";
  const color = price ? priceColor(price.changePrice) : "text-slate-400";
  const fmtPrice = (v: number) => isUS ? `$${formatNumber(v, 2)}` : `${formatNumber(v, 0)}원`;

  // 현재 종목 보유 현황
  const position = holdings.find((h) => h.symbol === symbol) ?? null;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header title="시장" />
      <div className="flex flex-1 overflow-hidden">

        {/* 좌측 패널 */}
        <aside className="w-56 shrink-0 border-r border-slate-200 bg-white flex flex-col shadow-sm">
          <div className="p-3 border-b border-slate-100 space-y-2">
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
              {(["US", "KR"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMarket(m); setSearch(""); setSearchError(null); }}
                  className={`py-1.5 text-xs font-semibold rounded-md transition-all ${market === m ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
                >
                  {m === "US" ? "🇺🇸 미국" : "🇰🇷 국내"}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                placeholder={market === "US" ? "AAPL, NVDA..." : "005930, 삼성..."}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSearchError(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") lookupSymbol(search);
                  if (e.key === "Escape") { setSearch(""); setSearchError(null); }
                }}
                className="w-full bg-slate-50 text-sm text-slate-800 pl-8 pr-8 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 placeholder-slate-400"
              />
              {search && (
                <button
                  onClick={() => { setSearch(""); setSearchError(null); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {showDirectSearch && (
              <button
                onClick={() => lookupSymbol(search)}
                disabled={searching}
                className="w-full py-1.5 bg-blue-50 text-blue-600 text-xs font-medium rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {searching ? <span className="animate-pulse">검색 중…</span> : <><Search className="w-3 h-3" />&ldquo;{search.toUpperCase()}&rdquo; 조회 (Enter)</>}
              </button>
            )}
            {searchError && <p className="text-xs text-red-500 text-center">{searchError}</p>}
          </div>

          <div className="flex-1 overflow-y-auto">
            {!search && recent.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 px-3 pt-3 pb-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span className="text-xs text-slate-400 font-medium">최근 조회</span>
                </div>
                {recent.map((s) => (
                  <button key={s.symbol} onClick={() => selectSymbol(s)}
                    className={`w-full flex items-center px-3 py-2 text-left hover:bg-slate-50 transition-colors ${symbol === s.symbol ? "bg-blue-50 border-r-2 border-blue-500" : ""}`}>
                    <div>
                      <p className="text-xs text-slate-700 font-medium">{s.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{s.symbol}</p>
                    </div>
                    {holdings.find((h) => h.symbol === s.symbol) && (
                      <span className="ml-auto text-xs bg-indigo-50 text-indigo-500 px-1 py-0.5 rounded font-medium">보유</span>
                    )}
                  </button>
                ))}
                <div className="border-b border-slate-100 my-1" />
              </div>
            )}
            <div>
              {!search && (
                <div className="flex items-center gap-1.5 px-3 pt-3 pb-1">
                  <Star className="w-3 h-3 text-slate-400" />
                  <span className="text-xs text-slate-400 font-medium">인기 종목</span>
                </div>
              )}
              {filtered.map((s) => (
                <button key={s.symbol} onClick={() => selectSymbol(s)}
                  className={`w-full flex items-center px-3 py-2.5 text-left hover:bg-slate-50 transition-colors ${symbol === s.symbol ? "bg-blue-50 border-r-2 border-blue-500" : ""}`}>
                  <div>
                    <p className="text-sm text-slate-800 font-medium">{s.name}</p>
                    <p className="text-xs text-slate-400 font-mono">{s.symbol}</p>
                  </div>
                  {holdings.find((h) => h.symbol === s.symbol) && (
                    <span className="ml-auto text-xs bg-indigo-50 text-indigo-500 px-1 py-0.5 rounded font-medium">보유</span>
                  )}
                </button>
              ))}
              {search && filtered.length === 0 && !showDirectSearch && (
                <p className="text-xs text-slate-400 text-center py-4">검색 결과 없음</p>
              )}
            </div>
          </div>
        </aside>

        {/* 메인 */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">

            {/* 시세 헤더 */}
            {loading ? (
              <div className="h-28 animate-pulse bg-white border border-slate-200 rounded-xl shadow-sm" />
            ) : price ? (
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex flex-wrap items-start gap-6">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs text-slate-400 font-mono">{price.symbol}</p>
                      {isUS && <span className="text-xs bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded font-medium">USD</span>}
                      {position && (
                        <span className="text-xs bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded font-medium">
                          보유 {isUS ? formatNumber(position.quantity, 4) : formatNumber(position.quantity, 0)}주
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">{price.symbolName ?? price.symbol}</h2>
                  </div>

                  <div>
                    <p className="text-3xl font-bold text-slate-900 tabular-nums">
                      {fmtPrice(price.currentPrice)}
                    </p>
                    {isUS && exchangeRate > 0 && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        ≈ {formatNumber(Math.round(price.currentPrice * exchangeRate), 0)}원
                        <span className="ml-2 text-slate-300">₩{formatNumber(exchangeRate, 1)}</span>
                      </p>
                    )}
                    <p className={`text-sm font-semibold mt-1 tabular-nums ${color}`}>
                      {(price.changePrice ?? 0) >= 0 ? "+" : ""}
                      {fmtPrice(price.changePrice ?? 0)}
                      {" "}({(price.changeRate ?? 0) >= 0 ? "+" : ""}{(price.changeRate ?? 0).toFixed(2)}%)
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 ml-auto text-xs">
                    {[
                      ["시가", price.openPrice],
                      ["고가", price.highPrice],
                      ["저가", price.lowPrice],
                      ["거래량", null],
                    ].map(([lbl, val]) => (
                      <div key={String(lbl)}>
                        <p className="text-slate-400 mb-0.5">{lbl}</p>
                        <p className="text-slate-700 tabular-nums font-medium">
                          {lbl === "거래량" ? formatNumber(price.volume) : fmtPrice(Number(val))}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-5 text-center text-slate-400 text-sm shadow-sm">
                시세 정보를 불러올 수 없습니다
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* 차트 */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-700">가격 차트</h3>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {INTERVALS.map(({ label, value }) => (
                      <button
                        key={value}
                        onClick={() => setInterval(value)}
                        className={`px-2 py-1 text-xs rounded-md transition-colors font-medium ${
                          interval === value ? "bg-blue-500 text-white" : "text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <CandleChart symbol={symbol} interval={interval} />
              </div>

              {/* 우측 패널 */}
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">호가창</h3>
                  <OrderBook symbol={symbol} />
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4">주문</h3>
                  <OrderForm
                    symbol={symbol}
                    currentPrice={price?.currentPrice ?? 0}
                    currency={currency}
                    exchangeRate={exchangeRate}
                    position={position}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MarketPage() {
  return (
    <Suspense>
      <MarketContent />
    </Suspense>
  );
}
