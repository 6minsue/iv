"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { useAppStore } from "@/store/useAppStore";
import { formatNumber } from "@/lib/utils";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Globe } from "lucide-react";

interface HoldingRow {
  symbol: string;
  symbolName: string;
  currency: string;
  marketCountry: string;
  quantity: number;
  lastPrice: number;
  averagePrice: number;
  marketValueNative: number;
  marketValueKRW: number;
  purchaseAmountNative: number;
  purchaseAmountKRW: number;
  profitLossNative: number;
  profitLossKRW: number;
  profitLossRate: number;
  dailyPnlNative: number;
  dailyPnlRate: number;
  exchangeRate: number;
}

interface Summary {
  exchangeRate: number;
  avgPurchaseRate: number;
  fxPnl: number;
  fxPnlRate: number;
  krwMarketValue: number;
  krwPurchase: number;
  krwPnl: number;
  usdMarketValue: number;
  usdPurchase: number;
  usdPnl: number;
  usdMarketValueKRW: number;
  usdPurchaseKRW: number;
  usdPnlKRW: number;
  totalMarketValueKRW: number;
  totalPurchaseKRW: number;
  totalPnlKRW: number;
  totalPnlRate: number;
  usdDailyPnlKRW: number;
  krwDailyPnl: number;
  dailyPnlRate: number;
}

const COLORS = ["#6366f1", "#06b6d4", "#f59e0b", "#10b981", "#f43f5e", "#8b5cf6", "#ec4899", "#14b8a6"];

function StatCard({
  label,
  value,
  sub,
  color,
  bg,
  border,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  bg: string;
  border: string;
  icon?: React.ElementType;
}) {
  return (
    <div className={`bg-white border ${border} rounded-xl p-4 shadow-sm`}>
      {Icon && (
        <div className={`inline-flex p-1.5 rounded-lg ${bg} mb-2`}>
          <Icon className={`w-3.5 h-3.5 ${color}`} />
        </div>
      )}
      <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function PortfolioPage() {
  const { selectedAccount } = useAppStore();
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedAccount) return;
    setLoading(true);
    fetch(`/api/holdings?accountSeq=${selectedAccount.accountSeq}`)
      .then((r) => r.json())
      .then((d) => {
        setHoldings(d.holdings ?? []);
        setSummary(d.summary ?? null);
      })
      .catch(() => { setHoldings([]); setSummary(null); })
      .finally(() => setLoading(false));
  }, [selectedAccount]);

  const totalKRW = summary?.totalMarketValueKRW ?? 0;

  const pieData = holdings.map((h) => ({
    name: h.symbolName ?? h.symbol,
    value: h.marketValueKRW,
    pct: totalKRW > 0 ? (h.marketValueKRW / totalKRW) * 100 : 0,
  }));

  const hasFxData = summary && summary.avgPurchaseRate > 0 && summary.usdMarketValue > 0;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header title="포트폴리오" />
      <div className="p-6 space-y-5 max-w-6xl mx-auto w-full">

        {!selectedAccount ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm shadow-sm">
            상단에서 계좌를 선택해주세요
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white border border-slate-200 rounded-xl animate-pulse shadow-sm" />)}
          </div>
        ) : holdings.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm shadow-sm">
            보유 종목이 없습니다
          </div>
        ) : (
          <>
            {/* 핵심 요약 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                label="총 평가금액"
                value={`${formatNumber(Math.round(totalKRW))}원`}
                sub={summary?.usdMarketValue ? `$${formatNumber(summary.usdMarketValue, 2)} 포함` : undefined}
                color="text-violet-600" bg="bg-violet-50" border="border-violet-100"
                icon={DollarSign}
              />
              <StatCard
                label="총 매입금액"
                value={`${formatNumber(Math.round(summary?.totalPurchaseKRW ?? 0))}원`}
                sub={summary?.usdPurchase ? `$${formatNumber(summary.usdPurchase, 2)} 환산 포함` : undefined}
                color="text-slate-700" bg="bg-slate-100" border="border-slate-200"
              />
              <StatCard
                label="평가손익 (원화)"
                value={`${(summary?.totalPnlKRW ?? 0) >= 0 ? "+" : ""}${formatNumber(Math.round(summary?.totalPnlKRW ?? 0))}원`}
                sub={summary ? `${summary.totalPnlRate >= 0 ? "+" : ""}${summary.totalPnlRate.toFixed(2)}%` : undefined}
                color={(summary?.totalPnlKRW ?? 0) >= 0 ? "text-red-500" : "text-blue-500"}
                bg={(summary?.totalPnlKRW ?? 0) >= 0 ? "bg-red-50" : "bg-blue-50"}
                border={(summary?.totalPnlKRW ?? 0) >= 0 ? "border-red-100" : "border-blue-100"}
                icon={(summary?.totalPnlKRW ?? 0) >= 0 ? TrendingUp : TrendingDown}
              />
              <StatCard
                label="일 손익"
                value={`${((summary?.usdDailyPnlKRW ?? 0) + (summary?.krwDailyPnl ?? 0)) >= 0 ? "+" : ""}${formatNumber(Math.round((summary?.usdDailyPnlKRW ?? 0) + (summary?.krwDailyPnl ?? 0)))}원`}
                sub={summary ? `${summary.dailyPnlRate >= 0 ? "+" : ""}${summary.dailyPnlRate.toFixed(2)}%` : undefined}
                color={((summary?.usdDailyPnlKRW ?? 0) + (summary?.krwDailyPnl ?? 0)) >= 0 ? "text-orange-500" : "text-indigo-500"}
                bg={((summary?.usdDailyPnlKRW ?? 0) + (summary?.krwDailyPnl ?? 0)) >= 0 ? "bg-orange-50" : "bg-indigo-50"}
                border={((summary?.usdDailyPnlKRW ?? 0) + (summary?.krwDailyPnl ?? 0)) >= 0 ? "border-orange-100" : "border-indigo-100"}
              />
            </div>

            {/* 환율 분석 패널 (미국주식 보유 시) */}
            {hasFxData && summary && (
              <div className="bg-white border border-blue-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-semibold text-slate-700">환율 분석 (USD 포지션)</h3>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                  <div>
                    <p className="text-slate-400 mb-1">평균 매입 환율</p>
                    <p className="text-slate-800 font-bold tabular-nums text-base">₩{formatNumber(summary.avgPurchaseRate, 1)}</p>
                    <p className="text-slate-400 mt-0.5">매수 시점 평균</p>
                  </div>
                  <div>
                    <p className="text-slate-400 mb-1">현재 환율</p>
                    <p className="text-slate-800 font-bold tabular-nums text-base">₩{formatNumber(summary.exchangeRate, 1)}</p>
                    <p className={`mt-0.5 font-medium ${summary.exchangeRate >= summary.avgPurchaseRate ? "text-red-500" : "text-blue-500"}`}>
                      {summary.exchangeRate >= summary.avgPurchaseRate ? "+" : ""}
                      {formatNumber(summary.exchangeRate - summary.avgPurchaseRate, 1)}원
                      ({summary.fxPnlRate >= 0 ? "+" : ""}{summary.fxPnlRate.toFixed(2)}%)
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 mb-1">USD 보유 평가액</p>
                    <p className="text-slate-800 font-bold tabular-nums text-base">${formatNumber(summary.usdMarketValue, 2)}</p>
                    <p className="text-slate-400 mt-0.5">≈ {formatNumber(Math.round(summary.usdMarketValueKRW))}원</p>
                  </div>
                  <div>
                    <p className="text-slate-400 mb-1">환율 손익 (추정)</p>
                    <p className={`font-bold tabular-nums text-base ${summary.fxPnl >= 0 ? "text-red-500" : "text-blue-500"}`}>
                      {summary.fxPnl >= 0 ? "+" : ""}{formatNumber(Math.round(summary.fxPnl))}원
                    </p>
                    <p className="text-slate-400 mt-0.5">현재 환율 기준 추정치</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* 파이 차트 */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 mb-1">비중</h3>
                <p className="text-xs text-slate-400 mb-3">USD → KRW 환산 기준</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#131826", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#e6e9f0" }}
                      formatter={(v: unknown, _: unknown, props: { payload?: { pct?: number } }) => [
                        typeof v === "number"
                          ? `${formatNumber(Math.round(v))}원 (${(props?.payload?.pct ?? 0).toFixed(1)}%)`
                          : "-",
                        "평가금액",
                      ]}
                      labelStyle={{ color: "#475569", fontSize: 12 }}
                      itemStyle={{ color: "#0f172a", fontSize: 12 }}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* 보유 목록 */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {["종목", "비중", "수량", "평균단가", "현재가", "평가금액", "손익 / 수익률"].map((h) => (
                        <th key={h} className="px-3 py-3 text-xs text-slate-500 text-left font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h, i) => {
                      const isUSD = h.currency === "USD";
                      const fmtNative = (v: number) => isUSD ? `$${formatNumber(v, 2)}` : `${formatNumber(v, 0)}원`;
                      const pct = totalKRW > 0 ? (h.marketValueKRW / totalKRW) * 100 : 0;
                      const priceGainUSD = isUSD ? (h.lastPrice - h.averagePrice) * h.quantity : 0;
                      return (
                        <tr key={h.symbol} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                              <div>
                                <p className="text-slate-800 font-semibold text-xs leading-tight">{h.symbolName ?? h.symbol}</p>
                                <p className="text-xs text-slate-400 font-mono">{h.symbol}</p>
                                {isUSD && <span className="text-xs text-blue-400">USD</span>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 tabular-nums text-slate-500 text-xs">{pct.toFixed(1)}%</td>
                          <td className="px-3 py-3 tabular-nums text-slate-700 text-xs">
                            {isUSD ? formatNumber(h.quantity, 4) : formatNumber(h.quantity, 0)}
                          </td>
                          <td className="px-3 py-3 tabular-nums text-slate-500 text-xs">{fmtNative(h.averagePrice)}</td>
                          <td className="px-3 py-3 tabular-nums text-slate-700 font-medium text-xs">{fmtNative(h.lastPrice)}</td>
                          <td className="px-3 py-3 text-xs">
                            <p className="tabular-nums text-slate-700 font-medium">{fmtNative(h.marketValueNative)}</p>
                            {isUSD && (
                              <p className="text-slate-400 tabular-nums text-xs">≈{formatNumber(Math.round(h.marketValueKRW))}원</p>
                            )}
                          </td>
                          <td className={`px-3 py-3 text-xs font-semibold ${h.profitLossRate >= 0 ? "text-red-500" : "text-blue-500"}`}>
                            <p className="tabular-nums">
                              {h.profitLossRate >= 0 ? "+" : ""}{fmtNative(h.profitLossNative)}
                            </p>
                            {isUSD && (
                              <p className="tabular-nums opacity-70 text-xs">
                                가격손익: {priceGainUSD >= 0 ? "+" : ""}${formatNumber(priceGainUSD, 2)}
                              </p>
                            )}
                            {isUSD && (
                              <p className="tabular-nums opacity-70 text-xs">
                                ≈{formatNumber(Math.round(h.profitLossKRW))}원
                              </p>
                            )}
                            <p className={`text-xs opacity-75 ${h.profitLossRate >= 0 ? "text-red-500" : "text-blue-500"}`}>
                              {h.profitLossRate >= 0 ? "+" : ""}{h.profitLossRate.toFixed(2)}%
                            </p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
