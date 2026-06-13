"use client";

import { useState } from "react";
import Header from "@/components/Header";
import { STRATEGIES } from "@/lib/quant/strategies";
import type { StrategyId, StrategyParams, BacktestResult } from "@/lib/quant/types";
import type { MLConfig } from "@/lib/quant/ml";
import { pct, formatNumber } from "@/lib/utils";
import {
  ResponsiveContainer, ComposedChart, Line, Area, AreaChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { FlaskConical, Play, TrendingUp, Brain, Activity, AlertCircle } from "lucide-react";

interface MLInfo {
  trainEndIndex: number;
  trainEndTime: string | null;
  featureNames: string[];
  importance: number[] | null;
  metrics: {
    trainAccuracy: number;
    testAccuracy: number;
    baseline: number;
    trainSamples: number;
    testSamples: number;
    positiveRate: number;
  };
}

interface BacktestResponse {
  symbol: string;
  interval: string;
  strategy: StrategyId;
  barCount: number;
  result: BacktestResult;
  ml: MLInfo | null;
  error?: string;
}

const INTERVALS = [
  { label: "일봉", value: "1d" },
  { label: "주봉", value: "1w" },
  { label: "1시간", value: "1h" },
  { label: "30분", value: "30m" },
];

// 전략별 파라미터 입력 정의
const PARAM_FIELDS: Record<string, { key: keyof StrategyParams; label: string; min: number; max: number; step: number }[]> = {
  ma_crossover: [
    { key: "fast", label: "단기 EMA", min: 2, max: 60, step: 1 },
    { key: "slow", label: "장기 EMA", min: 5, max: 200, step: 1 },
  ],
  rsi_reversion: [
    { key: "rsiPeriod", label: "RSI 기간", min: 2, max: 30, step: 1 },
    { key: "oversold", label: "과매도", min: 5, max: 45, step: 1 },
    { key: "overbought", label: "과매수", min: 55, max: 95, step: 1 },
  ],
  macd: [
    { key: "macdFast", label: "Fast", min: 3, max: 20, step: 1 },
    { key: "macdSlow", label: "Slow", min: 10, max: 40, step: 1 },
    { key: "macdSignal", label: "Signal", min: 3, max: 20, step: 1 },
  ],
  bollinger_reversion: [
    { key: "bbPeriod", label: "기간", min: 5, max: 50, step: 1 },
    { key: "bbK", label: "표준편차 배수", min: 1, max: 3, step: 0.1 },
  ],
  donchian_breakout: [{ key: "channel", label: "채널 기간", min: 5, max: 60, step: 1 }],
  ml: [],
};

const DEFAULT_ML: MLConfig = {
  model: "mlp",
  horizon: 5,
  threshold: 0,
  probThreshold: 0.55,
  trainRatio: 0.7,
  epochs: 400,
  learningRate: 0.08,
  hiddenUnits: 8,
  l2: 0.0008,
};

export default function StrategyLabPage() {
  const [symbol, setSymbol] = useState("AAPL");
  const [interval, setInterval] = useState("1d");
  const [count, setCount] = useState(200);
  const [strategy, setStrategy] = useState<StrategyId>("ma_crossover");
  const [params, setParams] = useState<StrategyParams>({ ...STRATEGIES[0].defaults });
  const [ml, setMl] = useState<MLConfig>(DEFAULT_ML);
  const [capital, setCapital] = useState(10_000_000);
  const [commission, setCommission] = useState(0.015);
  const [slippage, setSlippage] = useState(0.05);
  const [allowShort, setAllowShort] = useState(false);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BacktestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectStrategy = (id: StrategyId) => {
    setStrategy(id);
    const meta = STRATEGIES.find((s) => s.id === id);
    setParams({ ...(meta?.defaults ?? {}) });
  };

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/quant/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          interval,
          count,
          strategy,
          params,
          config: {
            initialCapital: capital,
            commission: commission / 100,
            slippage: slippage / 100,
            allowShort,
          },
          ml: strategy === "ml" ? ml : undefined,
        }),
      });
      const json: BacktestResponse = await res.json();
      if (json.error) {
        setError(json.error);
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setError("백테스트 실행 중 오류가 발생했습니다");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const meta = STRATEGIES.find((s) => s.id === strategy);
  const isUS = !/^\d{6}$/.test(symbol);
  const m = data?.result.metrics;

  // 자산곡선 데이터 (100 정규화)
  const equityData = data?.result.equityCurve.map((p) => ({
    time: p.time.slice(0, 10),
    strategy: (p.equity / capital) * 100,
    buyhold: (p.buyHold / capital) * 100,
    drawdown: p.drawdown,
  })) ?? [];

  const tooltipStyle = {
    contentStyle: { background: "#131826", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12, color: "#e6e9f0" },
    labelStyle: { color: "#64748b", fontSize: 11 },
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header title="전략 연구소" />
      <div className="p-6 space-y-5 max-w-7xl mx-auto w-full">

        {/* 컨트롤 패널 */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-slate-700">백테스트 설정</h2>
          </div>

          {/* 종목/인터벌/봉수 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">종목코드</label>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && run()}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-violet-400 font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">주기</label>
              <select value={interval} onChange={(e) => setInterval(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-violet-400">
                {INTERVALS.map((iv) => <option key={iv.value} value={iv.value}>{iv.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">캔들 수: {count} <span className="text-slate-300">(최대 200)</span></label>
              <input type="range" min={120} max={200} step={10} value={count}
                onChange={(e) => setCount(Number(e.target.value))} className="w-full accent-violet-500 mt-2.5" />
            </div>
            <div className="flex items-end">
              <button onClick={run} disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 shadow-sm">
                {loading ? <span className="animate-pulse">실행 중…</span> : <><Play className="w-4 h-4" />백테스트 실행</>}
              </button>
            </div>
          </div>

          {/* 전략 선택 */}
          <div>
            <label className="text-xs text-slate-500 mb-2 block">전략</label>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {STRATEGIES.map((s) => (
                <button key={s.id} onClick={() => selectStrategy(s.id)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    strategy === s.id ? "border-violet-400 bg-violet-50 ring-1 ring-violet-200" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {s.id === "ml" ? <Brain className="w-3.5 h-3.5 text-violet-500" /> : <Activity className="w-3.5 h-3.5 text-slate-400" />}
                    <span className="text-sm font-semibold text-slate-800">{s.name}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-snug">{s.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 파라미터 */}
          {strategy !== "ml" && meta && PARAM_FIELDS[strategy]?.length > 0 && (
            <div>
              <label className="text-xs text-slate-500 mb-2 block">파라미터</label>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {PARAM_FIELDS[strategy].map((f) => (
                  <div key={String(f.key)}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">{f.label}</span>
                      <span className="text-slate-800 font-mono font-semibold">{params[f.key] ?? f.min}</span>
                    </div>
                    <input type="range" min={f.min} max={f.max} step={f.step} value={params[f.key] ?? f.min}
                      onChange={(e) => setParams((p) => ({ ...p, [f.key]: Number(e.target.value) }))}
                      className="w-full accent-violet-500" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ML 설정 */}
          {strategy === "ml" && (
            <div className="bg-violet-50/50 border border-violet-100 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-3">
                <Brain className="w-3.5 h-3.5 text-violet-500" />
                <span className="text-xs font-semibold text-violet-700">머신러닝 설정</span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">모델</label>
                  <select value={ml.model} onChange={(e) => setMl((c) => ({ ...c, model: e.target.value as "logistic" | "mlp" }))}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-violet-400">
                    <option value="mlp">신경망 (MLP)</option>
                    <option value="logistic">로지스틱 회귀</option>
                  </select>
                </div>
                {[
                  { key: "horizon" as const, label: `예측구간: ${ml.horizon}봉`, min: 1, max: 20, step: 1, val: ml.horizon },
                  { key: "probThreshold" as const, label: `진입확률: ${ml.probThreshold.toFixed(2)}`, min: 0.5, max: 0.7, step: 0.01, val: ml.probThreshold },
                  { key: "trainRatio" as const, label: `학습비율: ${(ml.trainRatio * 100).toFixed(0)}%`, min: 0.5, max: 0.85, step: 0.05, val: ml.trainRatio },
                  { key: "epochs" as const, label: `에폭: ${ml.epochs}`, min: 100, max: 800, step: 50, val: ml.epochs },
                  { key: "hiddenUnits" as const, label: `은닉유닛: ${ml.hiddenUnits}`, min: 4, max: 16, step: 1, val: ml.hiddenUnits },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="text-xs text-slate-500 mb-1 block">{f.label}</label>
                    <input type="range" min={f.min} max={f.max} step={f.step} value={f.val}
                      onChange={(e) => setMl((c) => ({ ...c, [f.key]: Number(e.target.value) }))}
                      className="w-full accent-violet-500 mt-2" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 거래 비용 설정 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">초기자본 (원)</label>
              <input type="number" value={capital} onChange={(e) => setCapital(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-violet-400" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">수수료 (%): {commission}</label>
              <input type="range" min={0} max={0.5} step={0.005} value={commission}
                onChange={(e) => setCommission(Number(e.target.value))} className="w-full accent-violet-500 mt-2.5" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">슬리피지 (%): {slippage}</label>
              <input type="range" min={0} max={0.5} step={0.005} value={slippage}
                onChange={(e) => setSlippage(Number(e.target.value))} className="w-full accent-violet-500 mt-2.5" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer pb-2">
                <input type="checkbox" checked={allowShort} onChange={(e) => setAllowShort(e.target.checked)}
                  className="w-4 h-4 accent-violet-500" />
                공매도 허용
              </label>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-2 text-amber-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {loading && (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm shadow-sm animate-pulse">
            {strategy === "ml" ? "모델 학습 및 시뮬레이션 중…" : "시뮬레이션 실행 중…"}
          </div>
        )}

        {/* 결과 */}
        {data && m && !loading && (
          <>
            {/* 성과 지표 그리드 */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {[
                { label: "총 수익률", value: pct(m.totalReturn), tone: m.totalReturn >= 0, highlight: true },
                { label: "Buy & Hold", value: pct(m.buyHoldReturn), tone: m.buyHoldReturn >= 0, sub: true },
                { label: "초과수익(α)", value: pct(m.totalReturn - m.buyHoldReturn), tone: m.totalReturn - m.buyHoldReturn >= 0, highlight: true },
                { label: "CAGR", value: pct(m.cagr), tone: m.cagr >= 0 },
                { label: "샤프 지수", value: m.sharpe.toFixed(2), tone: m.sharpe >= 1, neutral: true },
                { label: "소르티노", value: m.sortino.toFixed(2), tone: m.sortino >= 1, neutral: true },
                { label: "최대낙폭(MDD)", value: pct(m.maxDrawdown), tone: false },
                { label: "칼마 지수", value: m.calmar.toFixed(2), tone: m.calmar >= 1, neutral: true },
                { label: "변동성(연)", value: pct(m.volatility), neutral: true, tone: true },
                { label: "승률", value: pct(m.winRate, 1).replace("+", ""), neutral: true, tone: m.winRate >= 0.5 },
                { label: "손익비(PF)", value: m.profitFactor.toFixed(2), tone: m.profitFactor >= 1, neutral: true },
                { label: "거래 / 노출", value: `${m.numTrades}회 / ${(m.exposure * 100).toFixed(0)}%`, neutral: true, tone: true },
              ].map((c) => (
                <div key={c.label} className={`bg-white border rounded-xl p-3 shadow-sm ${c.highlight ? "border-violet-200" : "border-slate-200"}`}>
                  <p className="text-xs text-slate-400 mb-1 font-medium">{c.label}</p>
                  <p className={`text-base font-bold tabular-nums ${
                    c.neutral ? "text-slate-800" : c.tone ? "text-red-500" : "text-blue-500"
                  }`}>{c.value}</p>
                </div>
              ))}
            </div>

            {/* ML 패널 */}
            {data.ml && (
              <div className="bg-white border border-violet-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Brain className="w-4 h-4 text-violet-500" />
                  <h3 className="text-sm font-semibold text-slate-700">머신러닝 진단 (아웃오브샘플)</h3>
                  <span className="text-xs text-slate-400">학습 {data.ml.metrics.trainSamples} · 검증 {data.ml.metrics.testSamples} 표본</span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  {[
                    { label: "학습 정확도", value: pct(data.ml.metrics.trainAccuracy, 1).replace("+", "") },
                    { label: "검증 정확도", value: pct(data.ml.metrics.testAccuracy, 1).replace("+", ""), highlight: true },
                    { label: "기준선(항상매수)", value: pct(data.ml.metrics.baseline, 1).replace("+", "") },
                    { label: "검증 우위", value: pct(data.ml.metrics.testAccuracy - data.ml.metrics.baseline, 1) },
                  ].map((c) => (
                    <div key={c.label}>
                      <p className="text-xs text-slate-400 mb-1">{c.label}</p>
                      <p className={`text-lg font-bold tabular-nums ${c.highlight ? "text-violet-600" : "text-slate-800"}`}>{c.value}</p>
                    </div>
                  ))}
                </div>
                {data.ml.importance && (
                  <div>
                    <p className="text-xs text-slate-500 mb-2 font-medium">피처 중요도 (로지스틱 가중치 |w|)</p>
                    <div className="space-y-1.5">
                      {(() => {
                        const imp = data.ml.importance;
                        const maxImp = Math.max(...imp, 1e-9);
                        return data.ml.featureNames.map((name, i) => (
                          <div key={name} className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 w-24 shrink-0">{name}</span>
                            <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div className="bg-violet-400 h-full rounded-full" style={{ width: `${(imp[i] / maxImp) * 100}%` }} />
                            </div>
                            <span className="text-xs text-slate-400 tabular-nums w-10 text-right">{imp[i].toFixed(2)}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}
                {!data.ml.importance && (
                  <p className="text-xs text-slate-400">신경망(MLP) 모델은 비선형이라 단일 피처 중요도를 표시하지 않습니다. 로지스틱 회귀를 선택하면 가중치를 확인할 수 있습니다.</p>
                )}
              </div>
            )}

            {/* 자산곡선 */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-700">자산 곡선 (초기자본 = 100)</h3>
                </div>
                <div className="flex gap-4 text-xs">
                  <span className="flex items-center gap-1.5 text-slate-500"><span className="w-4 h-0.5 bg-violet-500 inline-block rounded" />전략</span>
                  <span className="flex items-center gap-1.5 text-slate-500"><span className="w-4 h-0.5 bg-slate-300 inline-block rounded" />Buy&amp;Hold</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={equityData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} width={40} domain={["auto", "auto"]} />
                  <Tooltip {...tooltipStyle} formatter={(v: unknown, n) => [typeof v === "number" ? v.toFixed(1) : "-", n === "strategy" ? "전략" : "Buy&Hold"]} />
                  <ReferenceLine y={100} stroke="#cbd5e1" strokeDasharray="2 2" />
                  {data.ml?.trainEndTime && (
                    <ReferenceLine x={data.ml.trainEndTime.slice(0, 10)} stroke="#8b5cf6" strokeDasharray="4 3"
                      label={{ value: "학습→검증", fontSize: 10, fill: "#8b5cf6", position: "insideTopRight" }} />
                  )}
                  <Line dataKey="buyhold" stroke="#cbd5e1" strokeWidth={1.5} dot={false} name="buyhold" />
                  <Line dataKey="strategy" stroke="#8b5cf6" strokeWidth={2} dot={false} name="strategy" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* 낙폭 */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">낙폭 (Drawdown)</h3>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={equityData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.05} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.35} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                  <Tooltip {...tooltipStyle} formatter={(v: unknown) => [typeof v === "number" ? `${v.toFixed(2)}%` : "-", "낙폭"]} />
                  <Area dataKey="drawdown" stroke="#f43f5e" strokeWidth={1} fill="url(#ddFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* 거래 내역 */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">거래 내역</h3>
                <span className="text-xs text-slate-400">{data.result.trades.length}건</span>
              </div>
              {data.result.trades.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">체결된 거래가 없습니다</div>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="border-b border-slate-100">
                        {["방향", "진입일", "진입가", "청산일", "청산가", "보유", "손익"].map((h) => (
                          <th key={h} className="px-4 py-2 text-xs text-slate-500 text-left font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.result.trades.map((t, i) => (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-4 py-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${t.side === "LONG" ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-500"}`}>
                              {t.side === "LONG" ? "롱" : "숏"}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-500 font-mono">{t.entryTime.slice(0, 10)}</td>
                          <td className="px-4 py-2 text-xs text-slate-700 tabular-nums">{isUS ? `$${formatNumber(t.entryPrice, 2)}` : formatNumber(t.entryPrice)}</td>
                          <td className="px-4 py-2 text-xs text-slate-500 font-mono">{t.exitTime.slice(0, 10)}</td>
                          <td className="px-4 py-2 text-xs text-slate-700 tabular-nums">{isUS ? `$${formatNumber(t.exitPrice, 2)}` : formatNumber(t.exitPrice)}</td>
                          <td className="px-4 py-2 text-xs text-slate-400 tabular-nums">{t.barsHeld}봉</td>
                          <td className={`px-4 py-2 text-xs font-semibold tabular-nums ${t.pnl >= 0 ? "text-red-500" : "text-blue-500"}`}>
                            {t.pnlPct >= 0 ? "+" : ""}{t.pnlPct.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
