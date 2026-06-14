"use client";

import { useState, useRef } from "react";
import Header from "@/components/Header";
import { STRATEGIES } from "@/lib/quant/strategies";
import { buildSplit, NeuralModel, buildSequenceSplit, GRUModel, runGRU } from "@/lib/quant/livetrain";
import { CANDIDATES, candidateSignals } from "@/lib/quant/autoquant";
import { runBacktest } from "@/lib/quant/backtest";
import { analyzeStrategy } from "@/lib/quant/insights";
import { tossFeeProfile } from "@/lib/quant/fees";
import { cscvPBO, deflatedSharpe, sharpePerPeriod, skewness, kurtosis } from "@/lib/quant/validation";
import { runML } from "@/lib/quant/ml";
import type { StrategyId, Position, BacktestConfig } from "@/lib/quant/types";
import { pct, formatNumber } from "@/lib/utils";
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, Bar, Cell, Area, AreaChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import {
  Atom, Play, Repeat, Brain, SlidersHorizontal, Layers, AlertTriangle, ShieldCheck,
  Target, TrendingUp, TrendingDown, Minus, Lightbulb, Crosshair, Wallet, Clock,
  Cpu, Radar, CheckCircle2, Award, Zap,
} from "lucide-react";

type Tab = "auto" | "live" | "analyze" | "screen" | "walkforward" | "rl" | "optimize" | "portfolio";

const TABS: { id: Tab; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "auto", label: "오토파일럿", icon: Cpu, desc: "모델이 스스로 선택·앙상블" },
  { id: "live", label: "실시간 학습", icon: Zap, desc: "딥러닝 실시간 학습·선택" },
  { id: "analyze", label: "분석 & 추천", icon: Target, desc: "매수·매도·수량 추천" },
  { id: "screen", label: "종목 발굴", icon: Radar, desc: "국장/미장 스크리너" },
  { id: "walkforward", label: "워크포워드", icon: Repeat, desc: "학습→검증 반복 시뮬" },
  { id: "rl", label: "강화학습", icon: Brain, desc: "Q-러닝 에이전트" },
  { id: "optimize", label: "그리드서치", icon: SlidersHorizontal, desc: "최적화 + 과적합검증" },
  { id: "portfolio", label: "포트폴리오", icon: Layers, desc: "다종목 백테스트" },
];

const axis = { tick: { fill: "#5b6577", fontSize: 10 }, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />;
const tip = {
  contentStyle: { background: "#131826", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12, color: "#e6e9f0" },
  labelStyle: { color: "#9aa4b8", fontSize: 11 },
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "neutral" | "accent" }) {
  const color = tone === "up" ? "text-rose-400" : tone === "down" ? "text-blue-400" : tone === "accent" ? "text-violet-300" : "text-white";
  return (
    <div className="panel-2 px-4 py-3">
      <p className="text-[11px] text-[var(--text-mute)] mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

export default function ResearchLabPage() {
  const [tab, setTab] = useState<Tab>("auto");

  return (
    <div className="min-h-screen">
      <Header title="리서치 랩" />
      <div className="p-6 max-w-7xl mx-auto w-full space-y-5">
        {/* 헤더 배너 */}
        <div className="panel p-5 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="flex items-center gap-3 relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center glow">
              <Atom className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">AI 리서치 랩</h2>
              <p className="text-xs text-[var(--text-dim)]">
                실시간 딥러닝 학습·앙상블 · 워크포워드/CPCV·PBO·DSR로 과적합 없이 검증 · 실거래비용 반영
              </p>
            </div>
          </div>
        </div>

        {/* 탭 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {TABS.map(({ id, label, icon: Icon, desc }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`text-left p-3 rounded-xl border transition-all ${
                tab === id
                  ? "bg-white/[0.06] border-violet-400/40 ring-accent"
                  : "panel hover:border-[var(--border-strong)]"
              }`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${tab === id ? "text-violet-300" : "text-[var(--text-dim)]"}`} />
                <span className="text-sm font-semibold text-white">{label}</span>
              </div>
              <p className="text-[11px] text-[var(--text-mute)]">{desc}</p>
            </button>
          ))}
        </div>

        {tab === "auto" && <AutoTab />}
        {tab === "live" && <LiveTrainTab />}
        {tab === "analyze" && <AnalyzeTab />}
        {tab === "screen" && <ScreenTab />}
        {tab === "walkforward" && <WalkForwardTab />}
        {tab === "rl" && <RLTab />}
        {tab === "optimize" && <OptimizeTab />}
        {tab === "portfolio" && <PortfolioTab />}
      </div>
    </div>
  );
}

/* ============ 공용 입력 ============ */
function SymbolRow({ symbol, setSymbol, onRun, loading }: { symbol: string; setSymbol: (s: string) => void; onRun: () => void; loading: boolean }) {
  return (
    <div className="flex gap-2">
      <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === "Enter" && onRun()}
        className="flex-1 panel-2 px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-violet-400" />
      <button onClick={onRun} disabled={loading}
        className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 glow">
        {loading ? <span className="animate-pulse">실행중…</span> : <><Play className="w-4 h-4" />실행</>}
      </button>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-[var(--text-dim)]">{label}</span>
        <span className="text-white font-mono">{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-violet-500" />
    </div>
  );
}

/* ============ 분석 & 추천 (핵심) ============ */
interface AnalyzeResp {
  symbol: string;
  isUS: boolean;
  price: number;
  exchangeRate: number;
  feeLabel: string;
  result: {
    metrics: { totalReturn: number; buyHoldReturn: number; sharpe: number; maxDrawdown: number; cagr: number };
    equityCurve: { time: string; equity: number; buyHold: number }[];
    trades: { side: string; entryTime: string; exitTime: string; entryPrice: number; exitPrice: number; pnlPct: number; barsHeld: number }[];
  };
  analysis: {
    recommendation: {
      action: "BUY" | "HOLD" | "SELL" | "WAIT";
      reason: string; inPosition: boolean; signalAgeBars: number; price: number;
      stopLoss: number; takeProfit: number; atr: number; atrPct: number; riskRewardRatio: number;
      suggestedShares: number; suggestedAmountNative: number; suggestedAmountKRW: number;
      conviction: "높음" | "보통" | "낮음"; unrealizedPct: number | null;
    };
    stats: {
      totalTrades: number; winRate: number; avgReturnPct: number; medianReturnPct: number;
      avgWinPct: number; avgLossPct: number; expectancyPct: number; profitFactor: number;
      avgHoldBars: number; bestTradePct: number; worstTradePct: number; maxConsecLoss: number;
    };
    insights: string[];
  };
}

const ACTION_STYLE: Record<string, { bg: string; text: string; ring: string; icon: React.ElementType; label: string }> = {
  BUY: { bg: "from-emerald-500/20 to-emerald-500/5", text: "text-emerald-400", ring: "border-emerald-500/40", icon: TrendingUp, label: "매수" },
  HOLD: { bg: "from-blue-500/20 to-blue-500/5", text: "text-blue-400", ring: "border-blue-500/40", icon: Minus, label: "보유" },
  SELL: { bg: "from-rose-500/20 to-rose-500/5", text: "text-rose-400", ring: "border-rose-500/40", icon: TrendingDown, label: "매도" },
  WAIT: { bg: "from-slate-500/20 to-slate-500/5", text: "text-slate-300", ring: "border-slate-500/40", icon: Clock, label: "관망" },
};

function AnalyzeTab() {
  const [symbol, setSymbol] = useState("AAPL");
  const [strategy, setStrategy] = useState<StrategyId>("macd");
  const [budget, setBudget] = useState(1_000_000);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnalyzeResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/quant/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, interval: "1d", count: 200, strategy, budgetKRW: budget }),
      });
      const j = await res.json();
      if (j.error) { setErr(j.error); setData(null); } else setData(j);
    } catch { setErr("실행 오류"); } finally { setLoading(false); }
  };

  const isUS = data?.isUS ?? !/^\d{6}$/.test(symbol);
  const fmtP = (v: number) => (isUS ? `$${formatNumber(v, 2)}` : `${formatNumber(v, 0)}원`);
  const rec = data?.analysis.recommendation;
  const stats = data?.analysis.stats;
  const m = data?.result.metrics;
  const eq = data?.result.equityCurve.map((p) => ({ time: p.time.slice(5, 10), s: p.equity / 1e7 * 100, b: p.buyHold / 1e7 * 100 })) ?? [];
  const style = rec ? ACTION_STYLE[rec.action] : null;

  return (
    <div className="space-y-4">
      <div className="panel p-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <SymbolRow symbol={symbol} setSymbol={setSymbol} onRun={run} loading={loading} />
          <select value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyId)}
            className="w-full panel-2 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-400">
            {STRATEGIES.map((s) => <option key={s.id} value={s.id} className="bg-[var(--surface)]">{s.name}</option>)}
          </select>
        </div>
        <div>
          <Slider label={`투자 예산 ${(budget / 10000).toFixed(0)}만원`} value={budget} min={50000} max={10000000} step={50000} onChange={setBudget} />
          <p className="text-[11px] text-[var(--text-mute)] mt-2">⚠ 실거래는 주문당 5만원 한도 적용</p>
        </div>
      </div>

      {err && <div className="panel p-4 text-amber-400 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{err}</div>}
      {loading && <div className="panel p-12 text-center text-[var(--text-dim)] text-sm animate-pulse">분석 중…</div>}

      {rec && stats && m && style && !loading && (
        <>
          {/* 추천 히어로 카드 */}
          <div className={`panel p-6 bg-gradient-to-br ${style.bg} border ${style.ring}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center ${style.text}`}>
                  <style.icon className="w-8 h-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-3xl font-extrabold ${style.text}`}>{style.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full bg-white/5 ${style.text}`}>확신도 {rec.conviction}</span>
                  </div>
                  <p className="text-sm text-[var(--text-dim)] mt-1">{rec.reason}</p>
                  <p className="text-xs text-[var(--text-mute)] mt-0.5">{data!.symbol} · 현재가 {fmtP(rec.price)}{isUS && ` · ≈${formatNumber(Math.round(rec.price * data!.exchangeRate))}원`}</p>
                </div>
              </div>
              {rec.inPosition && rec.unrealizedPct != null && (
                <div className="text-right">
                  <p className="text-[11px] text-[var(--text-mute)]">미실현 손익</p>
                  <p className={`text-2xl font-bold tabular-nums ${rec.unrealizedPct >= 0 ? "text-rose-400" : "text-blue-400"}`}>
                    {rec.unrealizedPct >= 0 ? "+" : ""}{rec.unrealizedPct.toFixed(2)}%
                  </p>
                  <p className="text-[11px] text-[var(--text-mute)]">{rec.signalAgeBars}봉 보유</p>
                </div>
              )}
            </div>

            {/* 실행 디테일 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
              <div className="panel-2 px-4 py-3">
                <div className="flex items-center gap-1.5 mb-1"><Crosshair className="w-3 h-3 text-[var(--text-mute)]" /><p className="text-[11px] text-[var(--text-mute)]">진입가</p></div>
                <p className="text-base font-bold text-white tabular-nums">{fmtP(rec.price)}</p>
              </div>
              <div className="panel-2 px-4 py-3">
                <p className="text-[11px] text-blue-400 mb-1">손절 (−{(rec.atrPct * 2 * 100).toFixed(1)}%)</p>
                <p className="text-base font-bold text-blue-400 tabular-nums">{fmtP(rec.stopLoss)}</p>
              </div>
              <div className="panel-2 px-4 py-3">
                <p className="text-[11px] text-rose-400 mb-1">목표 (+{(rec.atrPct * 3 * 100).toFixed(1)}%)</p>
                <p className="text-base font-bold text-rose-400 tabular-nums">{fmtP(rec.takeProfit)}</p>
              </div>
              <div className="panel-2 px-4 py-3">
                <div className="flex items-center gap-1.5 mb-1"><Wallet className="w-3 h-3 text-[var(--text-mute)]" /><p className="text-[11px] text-[var(--text-mute)]">추천 수량 (손익비 1:{rec.riskRewardRatio.toFixed(1)})</p></div>
                <p className="text-base font-bold text-violet-300 tabular-nums">{isUS ? rec.suggestedShares.toFixed(4) : formatNumber(rec.suggestedShares)}주</p>
                <p className="text-[10px] text-[var(--text-mute)]">≈{formatNumber(Math.round(rec.suggestedAmountKRW))}원</p>
              </div>
            </div>
          </div>

          {/* 통계 스트립 */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5">
            <Stat label="거래당 평균" value={`${stats.avgReturnPct >= 0 ? "+" : ""}${stats.avgReturnPct.toFixed(2)}%`} tone={stats.avgReturnPct >= 0 ? "up" : "down"} />
            <Stat label="기대값/거래" value={`${stats.expectancyPct >= 0 ? "+" : ""}${stats.expectancyPct.toFixed(2)}%`} tone={stats.expectancyPct >= 0 ? "up" : "down"} />
            <Stat label="승률" value={`${(stats.winRate * 100).toFixed(0)}%`} />
            <Stat label="손익비(PF)" value={stats.profitFactor.toFixed(2)} tone={stats.profitFactor >= 1 ? "up" : "down"} />
            <Stat label="평균 보유" value={`${stats.avgHoldBars.toFixed(0)}봉`} />
            <Stat label="총 거래" value={String(stats.totalTrades)} />
            <Stat label="누적수익" value={pct(m.totalReturn)} tone={m.totalReturn >= 0 ? "up" : "down"} />
            <Stat label="최대낙폭" value={pct(m.maxDrawdown)} tone="down" />
          </div>

          {/* 인사이트 */}
          <div className="panel p-5">
            <div className="flex items-center gap-2 mb-3"><Lightbulb className="w-4 h-4 text-amber-400" /><h3 className="text-sm font-semibold text-white">인사이트</h3></div>
            <div className="space-y-2">
              {data!.analysis.insights.map((ins, i) => (
                <div key={i} className="flex gap-2 text-sm text-[var(--text-dim)] leading-relaxed panel-2 px-3 py-2">
                  <span>{ins}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 자산곡선 */}
          <div className="panel p-5">
            <h3 className="text-sm font-semibold text-white mb-1">전략 자산곡선 vs Buy & Hold</h3>
            <p className="text-[11px] text-[var(--text-mute)] mb-4">거래비용: {data!.feeLabel}</p>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={eq}>
                {grid}
                <XAxis dataKey="time" {...axis} minTickGap={40} />
                <YAxis {...axis} width={40} domain={["auto", "auto"]} />
                <Tooltip {...tip} formatter={(v: unknown, n) => [typeof v === "number" ? v.toFixed(1) : "-", n === "s" ? "전략" : "B&H"]} />
                <ReferenceLine y={100} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 2" />
                <Line dataKey="b" stroke="#475569" strokeWidth={1.5} dot={false} name="b" />
                <Line dataKey="s" stroke="#a78bfa" strokeWidth={2.5} dot={false} name="s" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* 거래 장부 — 언제 사서 언제 팔았는지 */}
          <div className="panel overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">모의 거래 장부 (언제 사서 / 언제 팔지)</h3>
              <span className="text-[11px] text-[var(--text-mute)]">{data!.result.trades.length}건</span>
            </div>
            {data!.result.trades.length === 0 ? (
              <div className="p-8 text-center text-[var(--text-mute)] text-sm">이 구간에서 체결된 거래가 없습니다</div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[var(--surface-2)]">
                    <tr>{["#", "매수일", "매수가", "매도일", "매도가", "보유", "수익률"].map((h) => <th key={h} className="px-4 py-2 text-[11px] text-[var(--text-mute)] text-left font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {data!.result.trades.map((t, i) => (
                      <tr key={i} className="border-b border-[var(--border)]">
                        <td className="px-4 py-2 text-xs text-[var(--text-mute)]">{i + 1}</td>
                        <td className="px-4 py-2 text-xs text-emerald-400/90 font-mono">{t.entryTime.slice(0, 10)}</td>
                        <td className="px-4 py-2 text-xs text-[var(--text-dim)] tabular-nums">{fmtP(t.entryPrice)}</td>
                        <td className="px-4 py-2 text-xs text-rose-400/90 font-mono">{t.exitTime.slice(0, 10)}</td>
                        <td className="px-4 py-2 text-xs text-[var(--text-dim)] tabular-nums">{fmtP(t.exitPrice)}</td>
                        <td className="px-4 py-2 text-xs text-[var(--text-mute)]">{t.barsHeld}봉</td>
                        <td className={`px-4 py-2 text-xs font-semibold tabular-nums ${t.pnlPct >= 0 ? "text-rose-400" : "text-blue-400"}`}>{t.pnlPct >= 0 ? "+" : ""}{t.pnlPct.toFixed(2)}%</td>
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
  );
}

/* ============ 워크포워드 ============ */
interface WFResult {
  feeLabel: string;
  result: {
    folds: { index: number; testStartTime: string; testEndTime: string; oosReturn: number; buyHoldReturn: number; trades: number; win: boolean }[];
    oosEquity: { time: string; equity: number; buyHold: number }[];
    aggregate: {
      totalOOSReturn: number; buyHoldReturn: number; alpha: number; avgFoldReturn: number;
      medianFoldReturn: number; winRate: number; totalFolds: number; sharpe: number;
      maxDrawdown: number; bestFold: number; worstFold: number;
    };
  };
}

function WalkForwardTab() {
  const [symbol, setSymbol] = useState("AAPL");
  const [strategy, setStrategy] = useState<StrategyId>("ma_crossover");
  const [trainBars, setTrainBars] = useState(120);
  const [testBars, setTestBars] = useState(10);
  const [anchored, setAnchored] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WFResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/quant/walkforward", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, interval: "1d", count: 200, strategy, wf: { trainBars, testBars, anchored } }),
      });
      const j = await res.json();
      if (j.error) { setErr(j.error); setData(null); } else setData(j);
    } catch { setErr("실행 오류"); } finally { setLoading(false); }
  };

  const a = data?.result.aggregate;
  const equity = data?.result.oosEquity.map((p) => ({ time: p.time.slice(5, 10), s: p.equity / 1e7 * 100, b: p.buyHold / 1e7 * 100 })) ?? [];
  const foldBars = data?.result.folds.map((f) => ({ name: `F${f.index + 1}`, ret: f.oosReturn * 100, win: f.win })) ?? [];

  return (
    <div className="space-y-4">
      <div className="panel p-5 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <SymbolRow symbol={symbol} setSymbol={setSymbol} onRun={run} loading={loading} />
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyId)}
              className="w-full panel-2 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-400">
              {STRATEGIES.map((s) => <option key={s.id} value={s.id} className="bg-[var(--surface)]">{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-2.5">
            <Slider label="학습창(봉)" value={trainBars} min={60} max={160} step={5} onChange={setTrainBars} />
            <Slider label="검증창(봉)" value={testBars} min={5} max={20} step={1} onChange={setTestBars} />
            <label className="flex items-center gap-2 text-xs text-[var(--text-dim)] cursor-pointer">
              <input type="checkbox" checked={anchored} onChange={(e) => setAnchored(e.target.checked)} className="accent-violet-500" />
              앵커드(확장창) 방식
            </label>
          </div>
        </div>
        {data && <p className="text-[11px] text-[var(--text-mute)]">거래비용: {data.feeLabel}</p>}
      </div>

      {err && <div className="panel p-4 text-amber-400 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{err}</div>}

      {a && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            <Stat label="OOS 누적수익" value={pct(a.totalOOSReturn)} tone={a.totalOOSReturn >= 0 ? "up" : "down"} />
            <Stat label="Buy & Hold" value={pct(a.buyHoldReturn)} tone={a.buyHoldReturn >= 0 ? "up" : "down"} />
            <Stat label="초과수익 α" value={pct(a.alpha)} tone="accent" />
            <Stat label="폴드 승률" value={pct(a.winRate, 0).replace("+", "")} />
            <Stat label="샤프(OOS)" value={a.sharpe.toFixed(2)} />
            <Stat label="최대낙폭" value={pct(a.maxDrawdown)} tone="down" />
          </div>

          <div className="panel p-5">
            <h3 className="text-sm font-semibold text-white mb-1">아웃오브샘플 자산곡선</h3>
            <p className="text-[11px] text-[var(--text-mute)] mb-4">{a.totalFolds}개 검증구간을 이어붙인 실전 시뮬 (각 폴드는 직전 학습창으로만 결정)</p>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={equity}>
                {grid}
                <XAxis dataKey="time" {...axis} minTickGap={40} />
                <YAxis {...axis} width={40} domain={["auto", "auto"]} />
                <Tooltip {...tip} formatter={(v: unknown, n) => [typeof v === "number" ? v.toFixed(1) : "-", n === "s" ? "전략" : "B&H"]} />
                <ReferenceLine y={100} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 2" />
                <Line dataKey="b" stroke="#475569" strokeWidth={1.5} dot={false} name="b" />
                <Line dataKey="s" stroke="#a78bfa" strokeWidth={2.5} dot={false} name="s" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="panel p-5">
              <h3 className="text-sm font-semibold text-white mb-4">폴드별 수익률 분포</h3>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={foldBars}>
                  {grid}
                  <XAxis dataKey="name" {...axis} />
                  <YAxis {...axis} width={36} tickFormatter={(v) => `${v}%`} />
                  <Tooltip {...tip} formatter={(v: unknown) => [typeof v === "number" ? `${v.toFixed(2)}%` : "-", "수익률"]} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <Bar dataKey="ret" radius={[3, 3, 0, 0]}>
                    {foldBars.map((f, i) => <Cell key={i} fill={f.win ? "#fb7185" : "#60a5fa"} />)}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="panel overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--border)]"><h3 className="text-sm font-semibold text-white">폴드 상세</h3></div>
              <div className="max-h-[200px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[var(--surface-2)]">
                    <tr>{["#", "검증구간", "수익률", "vs B&H", "거래"].map((h) => <th key={h} className="px-4 py-2 text-[11px] text-[var(--text-mute)] text-left font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {data!.result.folds.map((f) => (
                      <tr key={f.index} className="border-b border-[var(--border)]">
                        <td className="px-4 py-2 text-xs text-[var(--text-mute)]">{f.index + 1}</td>
                        <td className="px-4 py-2 text-xs text-[var(--text-dim)] font-mono">{f.testStartTime.slice(5, 10)}~{f.testEndTime.slice(5, 10)}</td>
                        <td className={`px-4 py-2 text-xs font-semibold tabular-nums ${f.oosReturn >= 0 ? "text-rose-400" : "text-blue-400"}`}>{pct(f.oosReturn)}</td>
                        <td className={`px-4 py-2 text-xs tabular-nums ${f.oosReturn - f.buyHoldReturn >= 0 ? "text-rose-400/70" : "text-blue-400/70"}`}>{pct(f.oosReturn - f.buyHoldReturn)}</td>
                        <td className="px-4 py-2 text-xs text-[var(--text-mute)]">{f.trades}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ============ 강화학습 ============ */
interface RLResp {
  result: { metrics: { totalReturn: number; buyHoldReturn: number; sharpe: number; maxDrawdown: number; winRate: number; numTrades: number }; equityCurve: { time: string; equity: number; buyHold: number }[] };
  rl: { trainEndTime: string | null; metrics: { episodes: number; visitedStates: number; avgRewardLast: number; convergence: number[] } };
}

function RLTab() {
  const [symbol, setSymbol] = useState("AAPL");
  const [episodes, setEpisodes] = useState(300);
  const [trainRatio, setTrainRatio] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RLResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/quant/backtest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, interval: "1d", count: 200, strategy: "rl", rl: { episodes, trainRatio } }),
      });
      const j = await res.json();
      if (j.error) { setErr(j.error); setData(null); } else setData(j);
    } catch { setErr("실행 오류"); } finally { setLoading(false); }
  };

  const m = data?.result.metrics;
  const conv = data?.rl.metrics.convergence.map((c, i) => ({ ep: i, r: c })) ?? [];
  const eq = data?.result.equityCurve.map((p) => ({ time: p.time.slice(5, 10), s: p.equity / 1e7 * 100, b: p.buyHold / 1e7 * 100 })) ?? [];

  return (
    <div className="space-y-4">
      <div className="panel p-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><SymbolRow symbol={symbol} setSymbol={setSymbol} onRun={run} loading={loading} /></div>
        <div className="space-y-2.5">
          <Slider label="에피소드" value={episodes} min={100} max={800} step={50} onChange={setEpisodes} />
          <Slider label={`학습비율 ${(trainRatio * 100).toFixed(0)}%`} value={trainRatio} min={0.5} max={0.85} step={0.05} onChange={setTrainRatio} />
        </div>
      </div>

      {err && <div className="panel p-4 text-amber-400 text-sm">{err}</div>}

      {m && data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            <Stat label="OOS 수익률" value={pct(m.totalReturn)} tone={m.totalReturn >= 0 ? "up" : "down"} />
            <Stat label="Buy & Hold" value={pct(m.buyHoldReturn)} tone={m.buyHoldReturn >= 0 ? "up" : "down"} />
            <Stat label="샤프" value={m.sharpe.toFixed(2)} />
            <Stat label="최대낙폭" value={pct(m.maxDrawdown)} tone="down" />
            <Stat label="학습 상태수" value={String(data.rl.metrics.visitedStates)} tone="accent" />
            <Stat label="거래수" value={String(m.numTrades)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="panel p-5">
              <h3 className="text-sm font-semibold text-white mb-1">학습 곡선</h3>
              <p className="text-[11px] text-[var(--text-mute)] mb-4">에피소드별 누적 보상 (수렴 = 정책 학습 완료)</p>
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={conv}>
                  <defs><linearGradient id="rlg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" stopOpacity={0.4} /><stop offset="100%" stopColor="#a78bfa" stopOpacity={0} /></linearGradient></defs>
                  {grid}
                  <XAxis dataKey="ep" {...axis} minTickGap={40} />
                  <YAxis {...axis} width={40} />
                  <Tooltip {...tip} formatter={(v: unknown) => [typeof v === "number" ? v.toFixed(3) : "-", "보상"]} />
                  <Area dataKey="r" stroke="#a78bfa" strokeWidth={2} fill="url(#rlg)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="panel p-5">
              <h3 className="text-sm font-semibold text-white mb-1">에이전트 자산곡선 (OOS)</h3>
              <p className="text-[11px] text-[var(--text-mute)] mb-4">학습 종료: {data.rl.trainEndTime?.slice(0, 10)}</p>
              <ResponsiveContainer width="100%" height={210}>
                <ComposedChart data={eq}>
                  {grid}
                  <XAxis dataKey="time" {...axis} minTickGap={40} />
                  <YAxis {...axis} width={40} domain={["auto", "auto"]} />
                  <Tooltip {...tip} formatter={(v: unknown, n) => [typeof v === "number" ? v.toFixed(1) : "-", n === "s" ? "RL" : "B&H"]} />
                  <ReferenceLine y={100} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 2" />
                  <Line dataKey="b" stroke="#475569" strokeWidth={1.5} dot={false} name="b" />
                  <Line dataKey="s" stroke="#34d399" strokeWidth={2.5} dot={false} name="s" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ============ 그리드서치 최적화 ============ */
interface OptResp {
  result: {
    strategy: string; trials: number; pbo: number; pboCombinations: number; dsr: number; bestSharpe: number; expectedMaxSharpe: number;
    best: { params: Record<string, number>; sharpe: number; totalReturn: number; maxDrawdown: number; trades: number };
    configs: { params: Record<string, number>; sharpe: number; totalReturn: number; maxDrawdown: number; trades: number }[];
  };
}

function OptimizeTab() {
  const [symbol, setSymbol] = useState("AAPL");
  const [strategy, setStrategy] = useState<StrategyId>("ma_crossover");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OptResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const techStrategies = STRATEGIES.filter((s) => s.id !== "ml" && s.id !== "rl");

  const run = async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/quant/optimize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, interval: "1d", count: 200, strategy }),
      });
      const j = await res.json();
      if (j.error) { setErr(j.error); setData(null); } else setData(j);
    } catch { setErr("실행 오류"); } finally { setLoading(false); }
  };

  const r = data?.result;
  const overfit = (r?.pbo ?? 0) > 0.5;

  return (
    <div className="space-y-4">
      <div className="panel p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SymbolRow symbol={symbol} setSymbol={setSymbol} onRun={run} loading={loading} />
        <select value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyId)}
          className="panel-2 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-400">
          {techStrategies.map((s) => <option key={s.id} value={s.id} className="bg-[var(--surface)]">{s.name}</option>)}
        </select>
      </div>

      {err && <div className="panel p-4 text-amber-400 text-sm">{err}</div>}

      {r && (
        <>
          {/* 과적합 진단 배너 */}
          <div className={`panel p-5 ${overfit ? "border-amber-500/30" : "border-emerald-500/30"}`}>
            <div className="flex items-center gap-2 mb-4">
              {overfit ? <AlertTriangle className="w-4 h-4 text-amber-400" /> : <ShieldCheck className="w-4 h-4 text-emerald-400" />}
              <h3 className="text-sm font-semibold text-white">과적합 진단 (López de Prado)</h3>
              <span className="text-[11px] text-[var(--text-mute)]">{r.trials}개 설정 · CSCV {r.pboCombinations}조합</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-[11px] text-[var(--text-mute)] mb-1">PBO (과적합 확률)</p>
                <p className={`text-2xl font-bold tabular-nums ${overfit ? "text-amber-400" : "text-emerald-400"}`}>{(r.pbo * 100).toFixed(1)}%</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className={`h-full rounded-full ${overfit ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${r.pbo * 100}%` }} />
                </div>
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-mute)] mb-1">DSR (차감 샤프)</p>
                <p className="text-2xl font-bold tabular-nums text-white">{(r.dsr * 100).toFixed(1)}%</p>
                <p className="text-[10px] text-[var(--text-mute)] mt-1">유의 신뢰도</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-mute)] mb-1">최고 샤프</p>
                <p className="text-2xl font-bold tabular-nums text-violet-300">{r.bestSharpe.toFixed(2)}</p>
                <p className="text-[10px] text-[var(--text-mute)] mt-1">기대최대 {r.expectedMaxSharpe.toFixed(2)}</p>
              </div>
              <div className="flex items-center">
                <p className={`text-sm font-medium ${overfit ? "text-amber-400" : "text-emerald-400"}`}>
                  {overfit
                    ? "⚠ 과적합 위험 높음 — 최고 설정이 우연일 가능성. 실거래 주의."
                    : "✓ 견고함 — 최고 설정이 선택편향을 넘어 유의."}
                </p>
              </div>
            </div>
          </div>

          {/* 최적 설정 + 랭킹 */}
          <div className="panel overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">설정 랭킹 (샤프 내림차순)</h3>
              <span className="text-[11px] text-[var(--text-mute)]">최적: {Object.entries(r.best.params).map(([k, v]) => `${k}=${v}`).join(" · ")}</span>
            </div>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--surface-2)]">
                  <tr>{["순위", "파라미터", "샤프", "수익률", "MDD", "거래"].map((h) => <th key={h} className="px-4 py-2 text-[11px] text-[var(--text-mute)] text-left font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {r.configs.map((c, i) => (
                    <tr key={i} className={`border-b border-[var(--border)] ${i === 0 ? "bg-violet-500/5" : ""}`}>
                      <td className="px-4 py-2 text-xs text-[var(--text-mute)]">{i + 1}{i === 0 && " 👑"}</td>
                      <td className="px-4 py-2 text-xs text-[var(--text-dim)] font-mono">{Object.entries(c.params).map(([k, v]) => `${k}:${v}`).join(" ")}</td>
                      <td className="px-4 py-2 text-xs font-semibold tabular-nums text-white">{c.sharpe.toFixed(2)}</td>
                      <td className={`px-4 py-2 text-xs tabular-nums ${c.totalReturn >= 0 ? "text-rose-400" : "text-blue-400"}`}>{pct(c.totalReturn)}</td>
                      <td className="px-4 py-2 text-xs tabular-nums text-blue-400">{pct(c.maxDrawdown)}</td>
                      <td className="px-4 py-2 text-xs text-[var(--text-mute)]">{c.trades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ============ 포트폴리오 ============ */
interface PortResp {
  symbols: string[];
  result: {
    equity: { time: string; portfolio: number; benchmark: number }[];
    perSymbol: { symbol: string; totalReturn: number; sharpe: number; maxDrawdown: number; trades: number }[];
    metrics: { totalReturn: number; cagr: number; sharpe: number; maxDrawdown: number; volatility: number; benchmarkReturn: number; alpha: number };
  };
}

function PortfolioTab() {
  const [symbolsStr, setSymbolsStr] = useState("AAPL, MSFT, NVDA, GOOGL, AMZN");
  const [strategy, setStrategy] = useState<StrategyId>("macd");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PortResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const techStrategies = STRATEGIES.filter((s) => s.id !== "ml" && s.id !== "rl");

  const run = async () => {
    setLoading(true); setErr(null);
    try {
      const symbols = symbolsStr.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      const res = await fetch("/api/quant/portfolio", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols, interval: "1d", count: 200, strategy }),
      });
      const j = await res.json();
      if (j.error) { setErr(j.error); setData(null); } else setData(j);
    } catch { setErr("실행 오류"); } finally { setLoading(false); }
  };

  const m = data?.result.metrics;
  const eq = data?.result.equity.map((p) => ({ time: p.time.slice(5, 10), s: p.portfolio / 1e7 * 100, b: p.benchmark / 1e7 * 100 })) ?? [];

  return (
    <div className="space-y-4">
      <div className="panel p-5 space-y-3">
        <div className="flex gap-2">
          <input value={symbolsStr} onChange={(e) => setSymbolsStr(e.target.value.toUpperCase())}
            placeholder="AAPL, MSFT, NVDA..."
            className="flex-1 panel-2 px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-violet-400" />
          <button onClick={run} disabled={loading}
            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 glow">
            {loading ? <span className="animate-pulse">실행중…</span> : <><Play className="w-4 h-4" />실행</>}
          </button>
        </div>
        <select value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyId)}
          className="w-full panel-2 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-400">
          {techStrategies.map((s) => <option key={s.id} value={s.id} className="bg-[var(--surface)]">{s.name}</option>)}
        </select>
        <p className="text-[11px] text-[var(--text-mute)]">동일가중 배분 · 최대 12종목 · Toss 거래비용 반영</p>
      </div>

      {err && <div className="panel p-4 text-amber-400 text-sm">{err}</div>}

      {m && data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            <Stat label="포트 수익률" value={pct(m.totalReturn)} tone={m.totalReturn >= 0 ? "up" : "down"} />
            <Stat label="벤치마크" value={pct(m.benchmarkReturn)} tone={m.benchmarkReturn >= 0 ? "up" : "down"} />
            <Stat label="초과수익 α" value={pct(m.alpha)} tone="accent" />
            <Stat label="샤프" value={m.sharpe.toFixed(2)} />
            <Stat label="변동성(연)" value={pct(m.volatility).replace("+", "")} />
            <Stat label="최대낙폭" value={pct(m.maxDrawdown)} tone="down" />
          </div>

          <div className="panel p-5">
            <h3 className="text-sm font-semibold text-white mb-1">포트폴리오 자산곡선</h3>
            <p className="text-[11px] text-[var(--text-mute)] mb-4">{data.symbols.join(" · ")} 동일가중</p>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={eq}>
                {grid}
                <XAxis dataKey="time" {...axis} minTickGap={40} />
                <YAxis {...axis} width={40} domain={["auto", "auto"]} />
                <Tooltip {...tip} formatter={(v: unknown, n) => [typeof v === "number" ? v.toFixed(1) : "-", n === "s" ? "포트폴리오" : "벤치마크"]} />
                <ReferenceLine y={100} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 2" />
                <Line dataKey="b" stroke="#475569" strokeWidth={1.5} dot={false} name="b" />
                <Line dataKey="s" stroke="#a78bfa" strokeWidth={2.5} dot={false} name="s" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="panel overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)]"><h3 className="text-sm font-semibold text-white">종목별 기여</h3></div>
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-2)]">
                <tr>{["종목", "수익률", "샤프", "MDD", "거래"].map((h) => <th key={h} className="px-4 py-2 text-[11px] text-[var(--text-mute)] text-left font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.result.perSymbol.map((s) => (
                  <tr key={s.symbol} className="border-b border-[var(--border)]">
                    <td className="px-4 py-2.5 text-sm font-semibold text-white font-mono">{s.symbol}</td>
                    <td className={`px-4 py-2.5 text-xs font-semibold tabular-nums ${s.totalReturn >= 0 ? "text-rose-400" : "text-blue-400"}`}>{pct(s.totalReturn)}</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-[var(--text-dim)]">{s.sharpe.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-blue-400">{pct(s.maxDrawdown)}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-mute)]">{s.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ============ 공용 분석 결과 뷰 (분석탭/오토탭 공유) ============ */
interface AnalysisData {
  symbol: string;
  isUS: boolean;
  exchangeRate: number;
  feeLabel: string;
  result: AnalyzeResp["result"];
  analysis: AnalyzeResp["analysis"];
}

function AnalysisView({ d }: { d: AnalysisData }) {
  const isUS = d.isUS;
  const fmtP = (v: number) => (isUS ? `$${formatNumber(v, 2)}` : `${formatNumber(v, 0)}원`);
  const rec = d.analysis.recommendation;
  const stats = d.analysis.stats;
  const m = d.result.metrics;
  const style = ACTION_STYLE[rec.action];
  const ActIcon = style.icon;
  const eq = d.result.equityCurve.map((p) => ({ time: p.time.slice(5, 10), s: (p.equity / 1e7) * 100, b: (p.buyHold / 1e7) * 100 }));

  return (
    <>
      <div className={`panel p-6 bg-gradient-to-br ${style.bg} border ${style.ring}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center ${style.text}`}><ActIcon className="w-8 h-8" /></div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-3xl font-extrabold ${style.text}`}>{style.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full bg-white/5 ${style.text}`}>확신도 {rec.conviction}</span>
              </div>
              <p className="text-sm text-[var(--text-dim)] mt-1">{rec.reason}</p>
              <p className="text-xs text-[var(--text-mute)] mt-0.5">{d.symbol} · 현재가 {fmtP(rec.price)}{isUS && ` · ≈${formatNumber(Math.round(rec.price * d.exchangeRate))}원`}</p>
            </div>
          </div>
          {rec.inPosition && rec.unrealizedPct != null && (
            <div className="text-right">
              <p className="text-[11px] text-[var(--text-mute)]">미실현 손익</p>
              <p className={`text-2xl font-bold tabular-nums ${rec.unrealizedPct >= 0 ? "text-rose-400" : "text-blue-400"}`}>{rec.unrealizedPct >= 0 ? "+" : ""}{rec.unrealizedPct.toFixed(2)}%</p>
              <p className="text-[11px] text-[var(--text-mute)]">{rec.signalAgeBars}봉 보유</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          <div className="panel-2 px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1"><Crosshair className="w-3 h-3 text-[var(--text-mute)]" /><p className="text-[11px] text-[var(--text-mute)]">진입가</p></div>
            <p className="text-base font-bold text-white tabular-nums">{fmtP(rec.price)}</p>
          </div>
          <div className="panel-2 px-4 py-3">
            <p className="text-[11px] text-blue-400 mb-1">손절 (−{(rec.atrPct * 2 * 100).toFixed(1)}%)</p>
            <p className="text-base font-bold text-blue-400 tabular-nums">{fmtP(rec.stopLoss)}</p>
          </div>
          <div className="panel-2 px-4 py-3">
            <p className="text-[11px] text-rose-400 mb-1">목표 (+{(rec.atrPct * 3 * 100).toFixed(1)}%)</p>
            <p className="text-base font-bold text-rose-400 tabular-nums">{fmtP(rec.takeProfit)}</p>
          </div>
          <div className="panel-2 px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1"><Wallet className="w-3 h-3 text-[var(--text-mute)]" /><p className="text-[11px] text-[var(--text-mute)]">추천 수량 (1:{rec.riskRewardRatio.toFixed(1)})</p></div>
            <p className="text-base font-bold text-violet-300 tabular-nums">{isUS ? rec.suggestedShares.toFixed(4) : formatNumber(rec.suggestedShares)}주</p>
            <p className="text-[10px] text-[var(--text-mute)]">≈{formatNumber(Math.round(rec.suggestedAmountKRW))}원</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5">
        <Stat label="거래당 평균" value={`${stats.avgReturnPct >= 0 ? "+" : ""}${stats.avgReturnPct.toFixed(2)}%`} tone={stats.avgReturnPct >= 0 ? "up" : "down"} />
        <Stat label="기대값/거래" value={`${stats.expectancyPct >= 0 ? "+" : ""}${stats.expectancyPct.toFixed(2)}%`} tone={stats.expectancyPct >= 0 ? "up" : "down"} />
        <Stat label="승률" value={`${(stats.winRate * 100).toFixed(0)}%`} />
        <Stat label="손익비(PF)" value={stats.profitFactor.toFixed(2)} tone={stats.profitFactor >= 1 ? "up" : "down"} />
        <Stat label="평균 보유" value={`${stats.avgHoldBars.toFixed(0)}봉`} />
        <Stat label="총 거래" value={String(stats.totalTrades)} />
        <Stat label="누적수익" value={pct(m.totalReturn)} tone={m.totalReturn >= 0 ? "up" : "down"} />
        <Stat label="최대낙폭" value={pct(m.maxDrawdown)} tone="down" />
      </div>

      <div className="panel p-5">
        <div className="flex items-center gap-2 mb-3"><Lightbulb className="w-4 h-4 text-amber-400" /><h3 className="text-sm font-semibold text-white">인사이트</h3></div>
        <div className="space-y-2">
          {d.analysis.insights.map((ins, i) => (
            <div key={i} className="flex gap-2 text-sm text-[var(--text-dim)] leading-relaxed panel-2 px-3 py-2"><span>{ins}</span></div>
          ))}
        </div>
      </div>

      <div className="panel p-5">
        <h3 className="text-sm font-semibold text-white mb-1">자산곡선 vs Buy & Hold</h3>
        <p className="text-[11px] text-[var(--text-mute)] mb-4">거래비용: {d.feeLabel}</p>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={eq}>
            {grid}
            <XAxis dataKey="time" {...axis} minTickGap={40} />
            <YAxis {...axis} width={40} domain={["auto", "auto"]} />
            <Tooltip {...tip} formatter={(v: unknown, n) => [typeof v === "number" ? v.toFixed(1) : "-", n === "s" ? "전략" : "B&H"]} />
            <ReferenceLine y={100} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 2" />
            <Line dataKey="b" stroke="#475569" strokeWidth={1.5} dot={false} name="b" />
            <Line dataKey="s" stroke="#a78bfa" strokeWidth={2.5} dot={false} name="s" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="panel overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">모의 거래 장부 (언제 사서 / 언제 팔지)</h3>
          <span className="text-[11px] text-[var(--text-mute)]">{d.result.trades.length}건</span>
        </div>
        {d.result.trades.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-mute)] text-sm">이 구간에서 체결된 거래가 없습니다</div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--surface-2)]">
                <tr>{["#", "매수일", "매수가", "매도일", "매도가", "보유", "수익률"].map((h) => <th key={h} className="px-4 py-2 text-[11px] text-[var(--text-mute)] text-left font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {d.result.trades.map((t, i) => (
                  <tr key={i} className="border-b border-[var(--border)]">
                    <td className="px-4 py-2 text-xs text-[var(--text-mute)]">{i + 1}</td>
                    <td className="px-4 py-2 text-xs text-emerald-400/90 font-mono">{t.entryTime.slice(0, 10)}</td>
                    <td className="px-4 py-2 text-xs text-[var(--text-dim)] tabular-nums">{fmtP(t.entryPrice)}</td>
                    <td className="px-4 py-2 text-xs text-rose-400/90 font-mono">{t.exitTime.slice(0, 10)}</td>
                    <td className="px-4 py-2 text-xs text-[var(--text-dim)] tabular-nums">{fmtP(t.exitPrice)}</td>
                    <td className="px-4 py-2 text-xs text-[var(--text-mute)]">{t.barsHeld}봉</td>
                    <td className={`px-4 py-2 text-xs font-semibold tabular-nums ${t.pnlPct >= 0 ? "text-rose-400" : "text-blue-400"}`}>{t.pnlPct >= 0 ? "+" : ""}{t.pnlPct.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ============ 오토파일럿 (클라이언트 실시간 평가·앙상블) ============ */
interface CandState {
  id: string; kind: string;
  oosReturn: number; oosSharpe: number; trades: number; currentSignal: number;
  status: "대기" | "평가중" | "완료"; selected: boolean;
}
const kindBadge = (k: string) => k === "ml" ? "bg-violet-500/15 text-violet-300" : k === "gru" ? "bg-amber-500/15 text-amber-300" : k === "rl" ? "bg-emerald-500/15 text-emerald-300" : "bg-blue-500/15 text-blue-300";
const kindLabel = (k: string) => k === "ml" ? "신경망" : k === "gru" ? "시계열딥러닝" : k === "rl" ? "강화학습" : "규칙";

function AutoTab() {
  const [symbol, setSymbol] = useState("005930");
  const [budget, setBudget] = useState(1_000_000);
  const [phase, setPhase] = useState<"idle" | "loading" | "evaluating" | "done">("idle");
  const [cands, setCands] = useState<CandState[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [agreement, setAgreement] = useState(0);
  const [lowConf, setLowConf] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [trainEndTime, setTrainEndTime] = useState("");
  const [pbo, setPbo] = useState<number | null>(null);
  const [dsr, setDsr] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const runningRef = useRef(false);
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const run = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setErr(null); setMembers([]); setAnalysisData(null); setPbo(null); setDsr(null); setPhase("loading");
    try {
      const isUS = !/^\d{6}$/.test(symbol);
      const [cr, er] = await Promise.all([
        fetch(`/api/candles?symbol=${symbol}&interval=1d&count=200`).then((r) => r.json()),
        isUS ? fetch(`/api/exchange-rate`).then((r) => r.json()).catch(() => ({ rate: 1400 })) : Promise.resolve({ rate: 1 }),
      ]);
      const bars = cr.candles ?? [];
      if (bars.length < 80) { setErr("데이터가 부족합니다 (잠시 후 재시도)"); setPhase("idle"); runningRef.current = false; return; }
      const exchangeRate = Number(er.rate ?? 1400);
      const fee = tossFeeProfile(symbol);
      const cfg: Partial<BacktestConfig> = { initialCapital: 1e7, commission: fee.commission, slippage: fee.slippage, sellTax: fee.sellTax, periodsPerYear: 252 };
      const trainEnd = Math.floor(bars.length * 0.7);
      setTrainEndTime(bars[trainEnd]?.time?.slice(0, 10) ?? "");

      const cs: CandState[] = CANDIDATES.map((c) => ({ id: c.id, kind: c.kind, oosReturn: 0, oosSharpe: 0, trades: 0, currentSignal: 0, status: "대기", selected: false }));
      setCands(cs.map((c) => ({ ...c })));
      setPhase("evaluating");

      const allSignals: Position[][] = [];
      const candReturns: number[][] = [];
      for (let i = 0; i < CANDIDATES.length; i++) {
        cs[i].status = "평가중"; setCands(cs.map((c) => ({ ...c }))); await sleep(80);
        const signals = candidateSignals(bars, CANDIDATES[i], 0.7);
        allSignals[i] = signals;
        const res = runBacktest(bars, signals, cfg, trainEnd);
        const eq = res.equityCurve.map((p) => p.equity);
        const rr: number[] = [];
        for (let t = 1; t < eq.length; t++) rr.push(eq[t - 1] === 0 ? 0 : eq[t] / eq[t - 1] - 1);
        candReturns[i] = rr;
        cs[i] = { ...cs[i], oosReturn: res.metrics.totalReturn, oosSharpe: res.metrics.sharpe, trades: res.trades.length, currentSignal: signals[bars.length - 1] ?? 0, status: "완료" };
        setCands(cs.map((c) => ({ ...c }))); await sleep(120);
      }

      // 과적합 진단 (CSCV PBO + DSR) — 9개 후보를 시도집합으로
      try {
        const minLen = Math.min(...candReturns.map((c) => c.length));
        if (minLen > 16) {
          const matrix: number[][] = [];
          for (let t = 0; t < minLen; t++) matrix.push(candReturns.map((col) => col[col.length - minLen + t]));
          const pboRes = cscvPBO(matrix, 8);
          const perPeriod = candReturns.map((c) => sharpePerPeriod(c));
          let bi = 0; for (let i = 1; i < cs.length; i++) if (cs[i].oosSharpe > cs[bi].oosSharpe) bi = i;
          const bestRets = candReturns[bi];
          const dsrRes = deflatedSharpe(perPeriod, bestRets.length, skewness(bestRets), kurtosis(bestRets));
          setPbo(pboRes.pbo); setDsr(dsrRes.dsr);
        }
      } catch { /* 진단 실패는 무시 */ }

      // 선별: OOS 수익>0 & 샤프>0, 상위 4. 없으면 최선 1개(낮은 확신도)
      const ranked = cs.map((c, idx) => ({ c, idx })).filter((x) => x.c.oosReturn > 0 && x.c.oosSharpe > 0).sort((a, b) => b.c.oosSharpe - a.c.oosSharpe);
      let chosen = ranked.slice(0, 4);
      let low = false;
      if (chosen.length === 0) { chosen = [...cs.map((c, idx) => ({ c, idx }))].sort((a, b) => b.c.oosSharpe - a.c.oosSharpe).slice(0, 1); low = true; }
      const chosenIdx = new Set(chosen.map((x) => x.idx));
      for (let i = 0; i < cs.length; i++) cs[i] = { ...cs[i], selected: chosenIdx.has(i) };
      setCands(cs.map((c) => ({ ...c }))); await sleep(250);

      // 다수결 앙상블
      const k = chosenIdx.size;
      const ensembleSignals: Position[] = bars.map((_: unknown, bar: number) => {
        let v = 0; chosenIdx.forEach((idx) => { if (allSignals[idx][bar] === 1) v++; });
        return (k > 0 && v > k / 2 ? 1 : 0) as Position;
      });
      let nowLong = 0; chosenIdx.forEach((idx) => { if (allSignals[idx][bars.length - 1] === 1) nowLong++; });
      const ensembleRes = runBacktest(bars, ensembleSignals, cfg, trainEnd);
      const analysis = analyzeStrategy(bars, ensembleSignals, ensembleRes.trades, { isUS, exchangeRate, budgetKRW: budget });

      setMembers(chosen.map((x) => cs[x.idx].id));
      setAgreement(k > 0 ? nowLong / k : 0);
      setLowConf(low);
      setAnalysisData({ symbol, isUS, exchangeRate, feeLabel: fee.label, result: ensembleRes, analysis });
      setPhase("done");
    } catch {
      setErr("실행 중 오류가 발생했습니다");
      setPhase("idle");
    } finally {
      runningRef.current = false;
    }
  };

  const busy = phase === "loading" || phase === "evaluating";

  return (
    <div className="space-y-4">
      <div className="panel p-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <SymbolRow symbol={symbol} setSymbol={setSymbol} onRun={run} loading={busy} />
          <p className="text-[11px] text-[var(--text-mute)] mt-2">규칙전략 6종 + 신경망 + GRU시계열 + 강화학습을 브라우저에서 실시간 평가 → 이긴 모델만 앙상블. (참고: FinRL 앙상블 · López de Prado)</p>
        </div>
        <Slider label={`투자 예산 ${(budget / 10000).toFixed(0)}만원`} value={budget} min={50000} max={10000000} step={50000} onChange={setBudget} />
      </div>

      {err && <div className="panel p-4 text-amber-400 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{err}</div>}
      {phase === "loading" && <div className="panel p-12 text-center text-[var(--text-dim)] text-sm animate-pulse">데이터 로딩…</div>}

      {(phase === "evaluating" || phase === "done") && (
        <>
          {/* 후보 모델 실시간 평가 스코어카드 */}
          <div className="panel overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Cpu className="w-4 h-4 text-violet-300" />후보 모델 실시간 평가 (아웃오브샘플)</h3>
              {trainEndTime && <span className="text-[11px] text-[var(--text-mute)]">검증 시작 {trainEndTime}</span>}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-2)]">
                <tr>{["모델", "종류", "OOS 수익률", "샤프", "거래", "현재", "상태"].map((h) => <th key={h} className="px-4 py-2 text-[11px] text-[var(--text-mute)] text-left font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {cands.map((c) => (
                  <tr key={c.id} className={`border-b border-[var(--border)] transition-colors ${c.selected ? "bg-violet-500/5" : ""}`}>
                    <td className="px-4 py-2 text-xs text-white font-medium">{c.id}</td>
                    <td className="px-4 py-2"><span className={`text-[10px] px-1.5 py-0.5 rounded ${kindBadge(c.kind)}`}>{kindLabel(c.kind)}</span></td>
                    <td className={`px-4 py-2 text-xs font-semibold tabular-nums ${c.status === "완료" ? (c.oosReturn >= 0 ? "text-rose-400" : "text-blue-400") : "text-[var(--text-mute)]"}`}>{c.status === "완료" ? pct(c.oosReturn) : "—"}</td>
                    <td className="px-4 py-2 text-xs tabular-nums text-[var(--text-dim)]">{c.status === "완료" ? c.oosSharpe.toFixed(2) : "—"}</td>
                    <td className="px-4 py-2 text-xs text-[var(--text-mute)]">{c.status === "완료" ? c.trades : "—"}</td>
                    <td className="px-4 py-2 text-xs">{c.status === "완료" ? (c.currentSignal === 1 ? <span className="text-rose-400">롱</span> : <span className="text-[var(--text-mute)]">현금</span>) : "—"}</td>
                    <td className="px-4 py-2">
                      {c.selected ? <span className="flex items-center gap-1 text-[11px] text-violet-300"><CheckCircle2 className="w-3.5 h-3.5" />선택</span>
                        : c.status === "평가중" ? <span className="text-[11px] text-amber-400 animate-pulse">평가중…</span>
                        : c.status === "완료" ? <Minus className="w-4 h-4 text-[var(--text-mute)]" />
                        : <span className="text-[11px] text-[var(--text-mute)]">대기</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 앙상블 요약 */}
          {phase === "done" && (
            <div className="panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-violet-300" />
                  <h3 className="text-sm font-semibold text-white">선택된 모델 앙상블</h3>
                  {lowConf && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">낮은 확신도 — 우위 모델 없음</span>}
                  {pbo != null && (
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${pbo > 0.5 ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-300"}`}
                      title="CSCV 기반 백테스트 과적합 확률 (López de Prado)">
                      PBO {(pbo * 100).toFixed(0)}%{pbo > 0.5 ? " ⚠ 과적합 위험" : " ✓ 견고"}
                    </span>
                  )}
                  {dsr != null && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] text-[var(--text-dim)]" title="차감 샤프지수 — 선택편향 보정 후 유의 신뢰도">
                      DSR {(dsr * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-[var(--text-mute)]">현재 롱 동의율 {(agreement * 100).toFixed(0)}% · {members.length}개 모델</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {members.map((mname) => (
                  <span key={mname} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-violet-500/10 text-violet-200 border border-violet-500/20">
                    <CheckCircle2 className="w-3 h-3" />{mname}
                  </span>
                ))}
              </div>
            </div>
          )}

          {phase === "done" && analysisData && <AnalysisView d={analysisData} />}
          {phase === "evaluating" && <div className="panel p-4 text-center text-[var(--text-dim)] text-sm animate-pulse">모델 평가 진행 중…</div>}
        </>
      )}
    </div>
  );
}

/* ============ 종목 발굴 스크리너 ============ */
interface ScreenRow {
  symbol: string; name: string; sector: string; price: number; score: number;
  signalLabel: string; mom20: number; mom60: number; rsi: number | null; atrPct: number; trend: string;
}
interface ScreenResp { market: string; scanned: number; rows: ScreenRow[]; diversified: ScreenRow[]; }

function ScreenTab() {
  const [market, setMarket] = useState<"KR" | "US">("KR");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScreenResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (mk: "KR" | "US") => {
    setLoading(true); setErr(null); setMarket(mk);
    try {
      const res = await fetch(`/api/quant/screen?market=${mk}`);
      const j = await res.json();
      if (j.error) { setErr(j.error); setData(null); } else setData(j);
    } catch { setErr("실행 오류"); } finally { setLoading(false); }
  };

  const isUS = market === "US";
  const fmtP = (v: number) => (isUS ? `$${formatNumber(v, 2)}` : `${formatNumber(v, 0)}원`);
  const scoreColor = (s: number) => s >= 30 ? "text-rose-400" : s >= 10 ? "text-rose-300" : s <= -30 ? "text-blue-400" : s <= -10 ? "text-blue-300" : "text-[var(--text-dim)]";

  return (
    <div className="space-y-4">
      <div className="panel p-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 bg-white/[0.04] rounded-lg">
          {(["KR", "US"] as const).map((mk) => (
            <button key={mk} onClick={() => run(mk)} disabled={loading}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${market === mk ? "bg-white/[0.08] text-white" : "text-[var(--text-dim)]"}`}>
              {mk === "KR" ? "🇰🇷 국장" : "🇺🇸 미장"}
            </button>
          ))}
        </div>
        <button onClick={() => run(market)} disabled={loading}
          className="flex items-center gap-2 px-5 py-1.5 bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 glow">
          {loading ? <span className="animate-pulse">스캔 중…</span> : <><Radar className="w-4 h-4" />스캔</>}
        </button>
        <p className="text-[11px] text-[var(--text-mute)]">종합신호 + 모멘텀 블렌드 점수 · 섹터 분산 추천 (레이트리밋으로 수 초 소요)</p>
      </div>

      {err && <div className="panel p-4 text-amber-400 text-sm">{err}</div>}
      {loading && <div className="panel p-12 text-center text-[var(--text-dim)] text-sm animate-pulse">{market === "KR" ? "국장" : "미장"} 대형주 스캔 중…</div>}

      {data && !loading && (
        <>
          {/* 분산 추천 */}
          <div className="panel p-5">
            <div className="flex items-center gap-2 mb-4"><Award className="w-4 h-4 text-amber-400" /><h3 className="text-sm font-semibold text-white">분산 포트폴리오 추천 (섹터 분산)</h3></div>
            {data.diversified.length === 0 ? (
              <p className="text-sm text-[var(--text-mute)]">현재 매수 우위(양수 점수) 종목이 없습니다. 관망 권장.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {data.diversified.map((r) => (
                  <div key={r.symbol} className="panel-2 p-3">
                    <p className="text-sm font-semibold text-white">{r.name}</p>
                    <p className="text-[10px] text-[var(--text-mute)] font-mono mb-1">{r.symbol} · {r.sector}</p>
                    <p className={`text-lg font-bold tabular-nums ${scoreColor(r.score)}`}>{r.score > 0 ? "+" : ""}{r.score}</p>
                    <p className="text-[10px] text-[var(--text-dim)]">{r.signalLabel} · {r.trend}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 전체 랭킹 */}
          <div className="panel overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">전체 스캔 ({data.scanned}종목)</h3>
              <span className="text-[11px] text-[var(--text-mute)]">점수 내림차순</span>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--surface-2)]">
                  <tr>{["종목", "섹터", "현재가", "점수", "신호", "20일", "60일", "RSI"].map((h) => <th key={h} className="px-4 py-2 text-[11px] text-[var(--text-mute)] text-left font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.symbol} className="border-b border-[var(--border)] hover:bg-white/[0.03]">
                      <td className="px-4 py-2"><p className="text-xs text-white font-medium">{r.name}</p><p className="text-[10px] text-[var(--text-mute)] font-mono">{r.symbol}</p></td>
                      <td className="px-4 py-2 text-xs text-[var(--text-dim)]">{r.sector}</td>
                      <td className="px-4 py-2 text-xs text-[var(--text-dim)] tabular-nums">{fmtP(r.price)}</td>
                      <td className={`px-4 py-2 text-sm font-bold tabular-nums ${scoreColor(r.score)}`}>{r.score > 0 ? "+" : ""}{r.score}</td>
                      <td className="px-4 py-2 text-xs text-[var(--text-dim)]">{r.signalLabel}</td>
                      <td className={`px-4 py-2 text-xs tabular-nums ${r.mom20 >= 0 ? "text-rose-400" : "text-blue-400"}`}>{pct(r.mom20)}</td>
                      <td className={`px-4 py-2 text-xs tabular-nums ${r.mom60 >= 0 ? "text-rose-400" : "text-blue-400"}`}>{pct(r.mom60)}</td>
                      <td className="px-4 py-2 text-xs text-[var(--text-mute)] tabular-nums">{r.rsi != null ? r.rsi.toFixed(0) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ============ 실시간 학습 (클라이언트 딥러닝 시각화) ============ */
interface LiveModel {
  name: string; H: number; color: string; kind: "dense" | "gru";
  loss: number[]; trainAcc: number[]; testAcc: number[];
  finalTrain: number; finalTest: number;
  status: "대기" | "학습중" | "완료";
}
const LIVE_CONFIGS: { name: string; H: number; color: string; kind: "dense" | "gru" }[] = [
  { name: "로지스틱 회귀", H: 0, color: "#60a5fa", kind: "dense" },
  { name: "신경망 (8유닛)", H: 8, color: "#a78bfa", kind: "dense" },
  { name: "신경망 (16유닛)", H: 16, color: "#34d399", kind: "dense" },
  { name: "GRU 순환신경망", H: 8, color: "#fbbf24", kind: "gru" },
];
const EPOCHS = 140;
const BATCH = 3;

function LiveTrainTab() {
  const [symbol, setSymbol] = useState("005930");
  const [phase, setPhase] = useState<"idle" | "loading" | "training" | "done">("idle");
  const [models, setModels] = useState<LiveModel[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [logs, setLogs] = useState<string[]>([]);
  const [baseline, setBaseline] = useState(0);
  const [bestIdx, setBestIdx] = useState<number | null>(null);
  const [budget, setBudget] = useState(1_000_000);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const runningRef = useRef(false);

  const addLog = (s: string) => setLogs((l) => [...l.slice(-60), s]);
  const sleep = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  const snap = (ms: LiveModel[]) => setModels(ms.map((m) => ({ ...m, loss: [...m.loss], trainAcc: [...m.trainAcc], testAcc: [...m.testAcc] })));

  const run = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setErr(null); setLogs([]); setBestIdx(null); setActiveIdx(-1); setAnalysisData(null); setPhase("loading");
    try {
      const isUS = !/^\d{6}$/.test(symbol);
      const [j, er] = await Promise.all([
        fetch(`/api/candles?symbol=${symbol}&interval=1d&count=200`).then((r) => r.json()),
        isUS ? fetch(`/api/exchange-rate`).then((r) => r.json()).catch(() => ({ rate: 1400 })) : Promise.resolve({ rate: 1 }),
      ]);
      const bars = j.candles ?? [];
      if (!bars.length) { setErr(j?.error?.message ?? "데이터를 불러올 수 없습니다 (잠시 후 재시도)"); setPhase("idle"); runningRef.current = false; return; }
      const exchangeRate = Number(er.rate ?? 1400);
      const split = buildSplit(bars, 5, 0, 0.7);
      if (!split) { setErr("학습 데이터가 부족합니다 (종목코드를 확인하세요)"); setPhase("idle"); runningRef.current = false; return; }
      setBaseline(split.posRate);
      const seqSplit = buildSequenceSplit(bars, 6, 5, 0, 0.7);
      addLog(`📥 데이터 ${bars.length}봉 · 학습 ${split.Xtr.length} / 검증 ${split.Xte.length} 표본 · 피처 ${split.featureNames.length}개`);
      addLog(`📊 기준선(항상 매수) 정확도 ${(split.posRate * 100).toFixed(1)}%`);

      const ms: LiveModel[] = LIVE_CONFIGS.map((c) => ({ ...c, loss: [], trainAcc: [], testAcc: [], finalTrain: 0, finalTest: 0, status: "대기" }));
      snap(ms);
      setPhase("training");

      const F = split.Xtr[0].length;
      for (let i = 0; i < ms.length; i++) {
        setActiveIdx(i);
        ms[i].status = "학습중";

        // GRU(시퀀스) vs Dense 분기. step() 호출이 한 epoch 학습.
        let step: () => { loss: number; trainAcc: number; testAcc: number };
        if (ms[i].kind === "gru") {
          if (!seqSplit) { ms[i].status = "완료"; addLog(`⚠ ${ms[i].name} 건너뜀 — 시퀀스 표본 부족`); snap(ms); await sleep(); continue; }
          addLog(`▶ ${ms[i].name} 학습 시작 (시퀀스 ${seqSplit.seqLen}봉 · 은닉 ${ms[i].H})`);
          const gru = new GRUModel(seqSplit.Xtr[0][0].length, ms[i].H, 0.25, 42 + i);
          step = () => gru.trainEpoch(seqSplit.Xtr, seqSplit.Ytr, seqSplit.Xte, seqSplit.Yte);
        } else {
          addLog(`▶ ${ms[i].name} 학습 시작 ${ms[i].H === 0 ? "(선형)" : `(은닉 ${ms[i].H}유닛)`}`);
          const nn = new NeuralModel(F, ms[i].H, ms[i].H === 0 ? 0.3 : 0.15, 0.0008, 42 + i);
          step = () => nn.trainEpoch(split.Xtr, split.Ytr, split.Xte, split.Yte);
        }

        for (let e = 0; e < EPOCHS; e++) {
          const r = step();
          ms[i].loss.push(r.loss);
          ms[i].trainAcc.push(r.trainAcc);
          ms[i].testAcc.push(r.testAcc);
          if (e % BATCH === 0 || e === EPOCHS - 1) { snap(ms); await sleep(); }
        }
        ms[i].finalTrain = ms[i].trainAcc[ms[i].trainAcc.length - 1];
        ms[i].finalTest = ms[i].testAcc[ms[i].testAcc.length - 1];
        ms[i].status = "완료";
        addLog(`✓ ${ms[i].name} 완료 — 검증 정확도 ${(ms[i].finalTest * 100).toFixed(1)}% (학습 ${(ms[i].finalTrain * 100).toFixed(1)}%)`);
        snap(ms);
        await sleep();
      }
      let best = 0;
      for (let i = 1; i < ms.length; i++) if (ms[i].finalTest > ms[best].finalTest) best = i;
      setBestIdx(best);
      const beat = ms[best].finalTest > split.posRate;
      addLog(`★ 최종 선택: ${ms[best].name} — 검증 ${(ms[best].finalTest * 100).toFixed(1)}% ${beat ? "> " : "≤ "}기준선 ${(split.posRate * 100).toFixed(1)}% ${beat ? "(기준선 상회 ✓)" : "(기준선 미달 — 예측 우위 약함)"}`);

      // 선택된 모델 → 즉시 매수/매도 추천 생성
      try {
        const w = LIVE_CONFIGS[best];
        addLog(`💡 ${w.name} 모델로 현재 매수/매도 추천 생성 중…`);
        const r = w.kind === "gru"
          ? runGRU(bars, { H: w.H, trainRatio: 0.7 })
          : runML(bars, { model: w.H === 0 ? "logistic" : "mlp", hiddenUnits: w.H || 8, trainRatio: 0.7 });
        const fee = tossFeeProfile(symbol);
        const cfg: Partial<BacktestConfig> = { initialCapital: 1e7, commission: fee.commission, slippage: fee.slippage, sellTax: fee.sellTax, periodsPerYear: 252 };
        const bt = runBacktest(bars, r.signals, cfg, r.trainEndIndex);
        const analysis = analyzeStrategy(bars, r.signals, bt.trades, { isUS, exchangeRate, budgetKRW: budget });
        setAnalysisData({ symbol, isUS, exchangeRate, feeLabel: fee.label, result: bt, analysis });
        addLog(`✅ 추천: ${analysis.recommendation.action} (확신도 ${analysis.recommendation.conviction})`);
      } catch { /* 추천 생성 실패는 무시 */ }

      setActiveIdx(-1);
      setPhase("done");
    } catch {
      setErr("학습 중 오류가 발생했습니다");
      setPhase("idle");
    } finally {
      runningRef.current = false;
    }
  };

  const maxLen = Math.max(0, ...models.map((m) => m.loss.length));
  const lossData = Array.from({ length: maxLen }, (_, e) => {
    const row: Record<string, number | undefined> = { epoch: e };
    models.forEach((m, i) => { row[`m${i}`] = m.loss[e]; });
    return row;
  });
  const active = activeIdx >= 0 ? models[activeIdx] : null;
  const activeEpoch = active ? active.loss.length : 0;
  const liveModel = phase === "done" && bestIdx != null ? models[bestIdx] : active;

  return (
    <div className="space-y-4">
      <div className="panel p-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="flex gap-2">
            <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && run()}
              className="flex-1 panel-2 px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-violet-400" />
            <button onClick={run} disabled={phase === "loading" || phase === "training"}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 glow">
              {phase === "training" ? <span className="animate-pulse">학습 중…</span> : phase === "loading" ? <span className="animate-pulse">로딩…</span> : <><Zap className="w-4 h-4" />학습 시작</>}
            </button>
          </div>
          <p className="text-[11px] text-[var(--text-mute)] mt-2">로지스틱·신경망(8/16)·GRU 4개 모델을 브라우저에서 실시간 학습 → 검증 정확도로 자동 선택 → 선택 모델로 즉시 매수/매도 추천. 각 {EPOCHS} epoch.</p>
        </div>
        <Slider label={`투자 예산 ${(budget / 10000).toFixed(0)}만원`} value={budget} min={50000} max={10000000} step={50000} onChange={setBudget} />
      </div>

      {err && <div className="panel p-4 text-amber-400 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{err}</div>}

      {(phase === "training" || phase === "done") && (
        <>
          {/* 실시간 상태 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="panel-2 px-4 py-3">
              <p className="text-[11px] text-[var(--text-mute)] mb-1">{phase === "done" ? "선택 모델" : "학습 중 모델"}</p>
              <p className="text-base font-bold text-white truncate">{liveModel ? liveModel.name : "—"}</p>
            </div>
            <div className="panel-2 px-4 py-3">
              <p className="text-[11px] text-[var(--text-mute)] mb-1">Epoch</p>
              <p className="text-base font-bold text-violet-300 tabular-nums">{phase === "done" ? EPOCHS : activeEpoch} / {EPOCHS}</p>
            </div>
            <div className="panel-2 px-4 py-3">
              <p className="text-[11px] text-[var(--text-mute)] mb-1">현재 손실(Loss)</p>
              <p className="text-base font-bold text-amber-300 tabular-nums">{liveModel && liveModel.loss.length ? liveModel.loss[liveModel.loss.length - 1].toFixed(4) : "—"}</p>
            </div>
            <div className="panel-2 px-4 py-3">
              <p className="text-[11px] text-[var(--text-mute)] mb-1">검증 정확도</p>
              <p className="text-base font-bold text-emerald-300 tabular-nums">{liveModel && liveModel.testAcc.length ? `${(liveModel.testAcc[liveModel.testAcc.length - 1] * 100).toFixed(1)}%` : "—"}</p>
            </div>
          </div>

          {/* 실시간 손실곡선 */}
          <div className="panel p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Zap className="w-4 h-4 text-violet-300" />실시간 학습 곡선 (손실)</h3>
              <div className="flex gap-3 text-xs">
                {LIVE_CONFIGS.map((c) => (
                  <span key={c.name} className="flex items-center gap-1.5 text-[var(--text-dim)]"><span className="w-3 h-0.5 inline-block" style={{ background: c.color }} />{c.name}</span>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={lossData}>
                {grid}
                <XAxis dataKey="epoch" {...axis} minTickGap={30} />
                <YAxis {...axis} width={44} domain={["auto", "auto"]} tickFormatter={(v) => v.toFixed(2)} />
                <Tooltip {...tip} formatter={(v: unknown, n) => [typeof v === "number" ? v.toFixed(4) : "-", LIVE_CONFIGS[Number(String(n).slice(1))]?.name ?? String(n)]} labelFormatter={(l) => `Epoch ${l}`} />
                {LIVE_CONFIGS.map((c, i) => (
                  <Line key={i} dataKey={`m${i}`} stroke={c.color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls name={`m${i}`} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 모델 선택 비교 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {models.map((m, i) => {
              const selected = bestIdx === i;
              const isActive = activeIdx === i;
              return (
                <div key={i} className={`panel p-4 transition-all ${selected ? "ring-accent border-violet-400/40" : isActive ? "border-[var(--border-strong)]" : ""}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: m.color }} />{m.name}
                    </span>
                    {selected ? <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-200"><Award className="w-3 h-3" />선택됨</span>
                      : <span className={`text-[11px] ${m.status === "완료" ? "text-emerald-400" : m.status === "학습중" ? "text-amber-400 animate-pulse" : "text-[var(--text-mute)]"}`}>{m.status}</span>}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[11px] mb-1"><span className="text-[var(--text-mute)]">검증 정확도</span><span className="text-white tabular-nums">{m.testAcc.length ? `${(m.testAcc[m.testAcc.length - 1] * 100).toFixed(1)}%` : "—"}</span></div>
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden relative">
                        <div className="h-full rounded-full transition-all" style={{ width: `${(m.testAcc.length ? m.testAcc[m.testAcc.length - 1] : 0) * 100}%`, background: m.color }} />
                        <div className="absolute top-0 bottom-0 w-0.5 bg-white/40" style={{ left: `${baseline * 100}%` }} title="기준선" />
                      </div>
                    </div>
                    <div className="flex justify-between text-[11px]"><span className="text-[var(--text-mute)]">학습 정확도</span><span className="text-[var(--text-dim)] tabular-nums">{m.trainAcc.length ? `${(m.trainAcc[m.trainAcc.length - 1] * 100).toFixed(1)}%` : "—"}</span></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 학습 로그 콘솔 */}
          <div className="panel overflow-hidden">
            <div className="px-5 py-2.5 border-b border-[var(--border)] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="text-sm font-semibold text-white">학습 로그</h3>
            </div>
            <div className="max-h-48 overflow-y-auto p-3 space-y-1 font-mono text-[11px] text-[var(--text-dim)]">
              {logs.map((l, i) => <div key={i} className="leading-relaxed">{l}</div>)}
            </div>
          </div>

          {phase === "done" && bestIdx != null && (
            <div className="panel p-4 flex items-center gap-2 text-sm border-violet-400/30">
              <CheckCircle2 className="w-4 h-4 text-violet-300" />
              <span className="text-[var(--text-dim)]">
                4개 모델 학습 완료. <span className="text-white font-semibold">{models[bestIdx].name}</span> 이 검증 정확도 {(models[bestIdx].finalTest * 100).toFixed(1)}%로 선택되었습니다
                {models[bestIdx].finalTest > baseline ? " — 기준선을 상회합니다." : " — 다만 기준선 대비 우위는 제한적입니다(주가 예측의 본질적 난이도)."}
              </span>
            </div>
          )}

          {/* 선택된 모델의 즉시 매수/매도 추천 */}
          {phase === "done" && analysisData && (
            <>
              <div className="flex items-center gap-2 pt-1">
                <Target className="w-4 h-4 text-violet-300" />
                <h3 className="text-sm font-semibold text-white">선택 모델의 현재 추천</h3>
                <span className="text-[11px] text-[var(--text-mute)]">{bestIdx != null ? models[bestIdx].name : ""} 기반</span>
              </div>
              <AnalysisView d={analysisData} />
            </>
          )}
        </>
      )}
    </div>
  );
}
