"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ShieldAlert, TrendingUp, TrendingDown, Wallet } from "lucide-react";

interface PositionInfo {
  quantity: number;
  averagePrice: number;
  marketValueNative: number;
  profitLossNative: number;
  profitLossRate: number;
  currency: string;
}

interface Props {
  symbol: string;
  currentPrice: number;
  currency?: "USD" | "KRW";
  exchangeRate?: number;
  position?: PositionInfo | null;
}

const MAX_ORDER_KRW = Number(process.env.NEXT_PUBLIC_MAX_ORDER_AMOUNT ?? 50000);

export default function OrderForm({
  symbol,
  currentPrice,
  currency = "KRW",
  exchangeRate = 1400,
  position = null,
}: Props) {
  const { selectedAccount } = useAppStore();
  const isUSD = currency === "USD";

  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"LIMIT" | "MARKET">("LIMIT");
  const [priceStr, setPriceStr] = useState("");
  const [qtyStr, setQtyStr] = useState(isUSD ? "0.1" : "1");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const userEditedPrice = useRef(false);

  // 현재가 변동 시 지정가 자동 갱신 (사용자가 직접 입력하지 않은 경우)
  useEffect(() => {
    if (!userEditedPrice.current) {
      setPriceStr(isUSD ? currentPrice.toFixed(2) : String(Math.round(currentPrice)));
    }
  }, [currentPrice, isUSD]);

  // 심볼 / 통화 변경 시 초기화
  useEffect(() => {
    userEditedPrice.current = false;
    setPriceStr(isUSD ? currentPrice.toFixed(2) : String(Math.round(currentPrice)));
    setQtyStr(isUSD ? "0.1" : "1");
    setResult(null);
    setOrderType("LIMIT");
    setSide("BUY");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const numPrice = orderType === "MARKET" ? currentPrice : Number(priceStr);
  const numQty = Number(qtyStr);
  const totalNative = isNaN(numPrice) || isNaN(numQty) || numPrice <= 0 || numQty <= 0 ? 0 : numPrice * numQty;
  const totalKRW = isUSD ? totalNative * exchangeRate : totalNative;
  const overLimit = side === "BUY" && totalKRW > MAX_ORDER_KRW;

  // 최대 매수 수량
  const maxBuyQty = numPrice > 0
    ? MAX_ORDER_KRW / (isUSD ? numPrice * exchangeRate : numPrice)
    : 0;

  const handleFillMax = () => {
    if (side === "SELL" && position) {
      // 전량 매도
      setQtyStr(isUSD ? formatNumber(position.quantity, 4).replace(/,/g, "") : String(position.quantity));
    } else {
      // 최대 매수
      const q = isUSD ? Math.floor(maxBuyQty * 10000) / 10000 : Math.floor(maxBuyQty);
      setQtyStr(isUSD ? q.toFixed(4) : String(q));
    }
  };

  const submit = async () => {
    if (!selectedAccount) return alert("계좌를 선택해주세요");
    if (overLimit) return alert(`주문 금액이 ${formatNumber(MAX_ORDER_KRW)}원 한도를 초과합니다.`);
    if (numQty <= 0) return alert("수량을 입력해주세요");
    setLoading(true);
    setResult(null);
    try {
      const payload: Record<string, unknown> = {
        accountSeq: selectedAccount.accountSeq,
        symbol,
        side,
        orderType,
        quantity: numQty,
      };
      if (orderType === "LIMIT") payload.price = numPrice;

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(`✓ 주문 접수: ${data.orderId ?? data.orderSeq ?? "완료"}`);
        setQtyStr(isUSD ? "0.1" : "1");
        userEditedPrice.current = false;
      } else {
        setResult(`✗ ${data.error ?? JSON.stringify(data)}`);
      }
    } catch {
      setResult("✗ 네트워크 오류");
    } finally {
      setLoading(false);
    }
  };

  const fmtNative = (v: number) => isUSD ? `$${formatNumber(v, 2)}` : `${formatNumber(v, 0)}원`;

  return (
    <div className="space-y-3">

      {/* 보유 현황 */}
      {position && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Wallet className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-500 font-semibold">보유 현황</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-slate-400 mb-0.5">보유수량</p>
              <p className="text-slate-800 font-semibold tabular-nums">
                {isUSD ? formatNumber(position.quantity, 4) : formatNumber(position.quantity, 0)}주
              </p>
            </div>
            <div>
              <p className="text-slate-400 mb-0.5">평균단가</p>
              <p className="text-slate-800 font-semibold tabular-nums">{fmtNative(position.averagePrice)}</p>
            </div>
            <div>
              <p className="text-slate-400 mb-0.5">평가손익</p>
              <p className={`font-semibold tabular-nums ${position.profitLossRate >= 0 ? "text-red-500" : "text-blue-500"}`}>
                {position.profitLossRate >= 0 ? "+" : ""}{position.profitLossRate.toFixed(2)}%
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-slate-200">
            <span className="text-xs text-slate-400">평가금액</span>
            <span className="text-xs text-slate-700 font-semibold tabular-nums">
              {fmtNative(position.marketValueNative)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">평가손익</span>
            <span className={`text-xs font-semibold tabular-nums ${position.profitLossRate >= 0 ? "text-red-500" : "text-blue-500"}`}>
              {position.profitLossNative >= 0 ? "+" : ""}{fmtNative(position.profitLossNative)}
              {position.profitLossRate >= 0
                ? <TrendingUp className="w-3 h-3 inline ml-1" />
                : <TrendingDown className="w-3 h-3 inline ml-1" />}
            </span>
          </div>
        </div>
      )}

      {/* 매수/매도 */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
        {(["BUY", "SELL"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={cn(
              "py-2 text-sm font-semibold rounded-md transition-all",
              side === s
                ? s === "BUY" ? "bg-red-500 text-white shadow-sm" : "bg-blue-500 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            {s === "BUY" ? "매수" : "매도"}
          </button>
        ))}
      </div>

      {/* 시장가 / 지정가 */}
      <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 rounded-md">
        {(["LIMIT", "MARKET"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setOrderType(t); userEditedPrice.current = false; }}
            className={cn(
              "py-1 text-xs font-medium rounded transition-all",
              orderType === t ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
            )}
          >
            {t === "LIMIT" ? "지정가" : "시장가"}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {/* 가격 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-slate-500">가격</label>
            {isUSD && orderType === "LIMIT" && (
              <span className="text-xs text-slate-400">≈ ₩{formatNumber(Number(priceStr) * exchangeRate, 0)}</span>
            )}
          </div>
          {orderType === "MARKET" ? (
            <div className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-400 flex items-center gap-1.5">
              <span className="text-slate-300">≈</span>
              <span>{fmtNative(currentPrice)}</span>
              <span className="text-xs">(시장가)</span>
            </div>
          ) : (
            <div className="relative">
              {isUSD && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>}
              <input
                type="number"
                value={priceStr}
                step={isUSD ? "0.01" : "1"}
                min="0"
                onChange={(e) => { setPriceStr(e.target.value); userEditedPrice.current = true; }}
                className={cn(
                  "w-full bg-white border border-slate-200 rounded-lg py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-400 tabular-nums",
                  isUSD ? "pl-7 pr-3" : "px-3"
                )}
              />
            </div>
          )}
        </div>

        {/* 수량 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-slate-500">
              수량 {isUSD && <span className="text-slate-400">(소수점 가능)</span>}
            </label>
            <button
              onClick={handleFillMax}
              className="text-xs text-blue-500 hover:text-blue-600 font-medium"
            >
              {side === "SELL" && position
                ? `전량 (${isUSD ? formatNumber(position.quantity, 4) : formatNumber(position.quantity, 0)})`
                : `최대 (${isUSD ? maxBuyQty.toFixed(4) : Math.floor(maxBuyQty)})`
              }
            </button>
          </div>
          <input
            type="number"
            value={qtyStr}
            min={isUSD ? "0.0001" : "1"}
            step={isUSD ? "0.0001" : "1"}
            onChange={(e) => setQtyStr(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-400 tabular-nums"
          />
        </div>

        {/* 주문 금액 */}
        <div className={cn(
          "rounded-lg px-3 py-2.5 text-xs border space-y-1",
          overLimit ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"
        )}>
          <div className="flex justify-between">
            <span className={overLimit ? "text-red-500 font-medium" : "text-slate-500"}>주문 금액</span>
            <span className={cn("font-semibold tabular-nums", overLimit ? "text-red-600" : "text-slate-700")}>
              {totalNative > 0 ? fmtNative(totalNative) : "—"}
            </span>
          </div>
          {isUSD && totalNative > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-slate-400">원화 환산</span>
                <span className={cn("tabular-nums font-medium", overLimit ? "text-red-500" : "text-slate-600")}>
                  ≈ {formatNumber(Math.round(totalKRW), 0)}원
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">적용 환율</span>
                <span className="tabular-nums text-slate-500">₩{formatNumber(exchangeRate, 1)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 한도 표시 */}
      {side === "BUY" && (
        <div className={cn(
          "flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 border",
          overLimit
            ? "text-red-600 bg-red-50 border-red-200"
            : "text-amber-600 bg-amber-50 border-amber-200"
        )}>
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>
            {overLimit
              ? `한도 초과 — 최대 ${formatNumber(MAX_ORDER_KRW)}원`
              : `매수 한도 ${formatNumber(MAX_ORDER_KRW)}원 / 잔여 ${formatNumber(Math.round(MAX_ORDER_KRW - totalKRW))}원`
            }
          </span>
        </div>
      )}

      <button
        onClick={submit}
        disabled={loading || !selectedAccount || (side === "BUY" && overLimit)}
        className={cn(
          "w-full py-3 rounded-lg font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm",
          side === "BUY" ? "bg-red-500 hover:bg-red-600 text-white" : "bg-blue-500 hover:bg-blue-600 text-white"
        )}
      >
        {loading
          ? "처리 중..."
          : `${side === "BUY" ? "매수" : "매도"} ${orderType === "MARKET" ? "시장가" : "지정가"} 주문`}
      </button>

      {result && (
        <p className={cn(
          "text-xs text-center px-3 py-2 rounded-lg",
          result.startsWith("✓") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"
        )}>
          {result}
        </p>
      )}
    </div>
  );
}
