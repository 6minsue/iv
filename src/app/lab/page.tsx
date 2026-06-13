"use client";

import { useState } from "react";
import Header from "@/components/Header";
import { STRATEGIES } from "@/lib/quant/strategies";
import type { StrategyId } from "@/lib/quant/types";
import { pct, formatNumber } from "@/lib/utils";
import {
  ResponsiveContainer, ComposedChart, Line, Bar, Cell, Area, AreaChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import {
  Atom, Play, Repeat, Brain, SlidersHorizontal, Layers, AlertTriangle, ShieldCheck,
  Target, TrendingUp, TrendingDown, Minus, Lightbulb, Crosshair, Wallet, Clock,
} from "lucide-react";

type Tab = "analyze" | "walkforward" | "rl" | "optimize" | "portfolio";

const TABS: { id: Tab; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "analyze", label: "분석 & 추천", icon: Target, desc: "매수·매도·수량 추천" },
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
  const [tab, setTab] = useState<Tab>("analyze");

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
              <h2 className="text-lg font-bold text-white">퀀트 리서치 랩</h2>
              <p className="text-xs text-[var(--text-dim)]">
                10개월(≤200봉) 데이터 · 워크포워드/CPCV·PBO·DSR로 과적합 없이 검증 · Toss 실거래비용 반영
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

        {tab === "analyze" && <AnalyzeTab />}
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
