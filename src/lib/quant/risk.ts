// 포트폴리오 리스크 분석 (과학적 방법론)
// - 역사적 시뮬레이션 VaR + 모수적(Gaussian) VaR + CVaR(Expected Shortfall)
// - Sharpe/Sortino, 최대낙폭, 변동성, 왜도/첨도
// - 몬테카를로 시뮬레이션 (부트스트랩 + Gaussian 혼합)
// 참고: J.P. Morgan RiskMetrics(VaR), Markowitz MPT, Rockafellar-Uryasev(CVaR)

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rand: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function dailyReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) out.push(values[i - 1] === 0 ? 0 : values[i] / values[i - 1] - 1);
  return out;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface RiskMetrics {
  totalReturn: number;
  annualReturn: number;
  annualVolatility: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  calmar: number;
  // VaR/CVaR = 1일 손실 비율(양수). 금액 = 포트폴리오가치 × 비율
  var95Hist: number;
  var99Hist: number;
  var95Param: number;
  cvar95: number;
  downsideDeviation: number;
  bestDay: number;
  worstDay: number;
  positiveDayRatio: number;
  skewness: number;
  kurtosis: number;
  observations: number;
}

export function computeRisk(values: number[], periodsPerYear = 252): RiskMetrics | null {
  if (values.length < 10) return null;
  const rets = dailyReturns(values);
  const n = rets.length;
  const mean = rets.reduce((a, b) => a + b, 0) / n;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const ann = Math.sqrt(periodsPerYear);

  const downside = rets.filter((r) => r < 0);
  const downsideStd = downside.length ? Math.sqrt(downside.reduce((a, b) => a + b * b, 0) / downside.length) : 0;

  const totalReturn = values[0] === 0 ? 0 : values[values.length - 1] / values[0] - 1;
  const years = n / periodsPerYear;
  const annualReturn = years > 0 && values[0] > 0 ? Math.pow(values[values.length - 1] / values[0], 1 / years) - 1 : 0;

  let peak = values[0], maxDD = 0;
  for (const v of values) { peak = Math.max(peak, v); maxDD = Math.min(maxDD, peak > 0 ? v / peak - 1 : 0); }

  const sorted = [...rets].sort((a, b) => a - b);
  const var95Hist = -percentile(sorted, 5);
  const var99Hist = -percentile(sorted, 1);
  const var95Param = -(mean - 1.645 * std);
  const tail = sorted.filter((r) => r <= percentile(sorted, 5));
  const cvar95 = tail.length ? -(tail.reduce((a, b) => a + b, 0) / tail.length) : var95Hist;

  const skew = std > 0 ? rets.reduce((a, b) => a + ((b - mean) / std) ** 3, 0) / n : 0;
  const kurt = std > 0 ? rets.reduce((a, b) => a + ((b - mean) / std) ** 4, 0) / n : 3;

  return {
    totalReturn,
    annualReturn,
    annualVolatility: std * ann,
    sharpe: std === 0 ? 0 : (mean / std) * ann,
    sortino: downsideStd === 0 ? 0 : (mean / downsideStd) * ann,
    maxDrawdown: maxDD,
    calmar: maxDD === 0 ? 0 : annualReturn / Math.abs(maxDD),
    var95Hist, var99Hist, var95Param, cvar95,
    downsideDeviation: downsideStd * ann,
    bestDay: Math.max(...rets),
    worstDay: Math.min(...rets),
    positiveDayRatio: rets.filter((r) => r > 0).length / n,
    skewness: skew,
    kurtosis: kurt,
    observations: n,
  };
}

export interface MonteCarloResult {
  days: number;
  sims: number;
  start: number;
  band: { day: number; p5: number; p25: number; p50: number; p75: number; p95: number }[];
  finalP5: number;
  finalP50: number;
  finalP95: number;
  probLoss: number;
  expectedReturn: number;
}

/**
 * 몬테카를로 포트폴리오 가치 시뮬레이션.
 * 일별수익률을 50% 부트스트랩(실측 분포) + 50% Gaussian(평균/표준편차)으로 샘플링.
 */
export function monteCarlo(values: number[], days = 30, sims = 2000, seed = 7): MonteCarloResult | null {
  const rets = dailyReturns(values);
  if (rets.length < 10) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const std = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length);
  const start = values[values.length - 1];
  const rand = mulberry32(seed);

  // [sim][day] 가치
  const paths: number[][] = [];
  for (let s = 0; s < sims; s++) {
    const path: number[] = [start];
    let v = start;
    for (let d = 0; d < days; d++) {
      const r = rand() < 0.5
        ? rets[Math.floor(rand() * rets.length)]   // 부트스트랩
        : mean + std * gaussian(rand);             // Gaussian
      v = v * (1 + r);
      path.push(v);
    }
    paths.push(path);
  }

  const band: MonteCarloResult["band"] = [];
  for (let d = 0; d <= days; d++) {
    const col = paths.map((p) => p[d]).sort((a, b) => a - b);
    band.push({
      day: d,
      p5: percentile(col, 5),
      p25: percentile(col, 25),
      p50: percentile(col, 50),
      p75: percentile(col, 75),
      p95: percentile(col, 95),
    });
  }
  const finals = paths.map((p) => p[days]).sort((a, b) => a - b);
  return {
    days, sims, start,
    band,
    finalP5: percentile(finals, 5),
    finalP50: percentile(finals, 50),
    finalP95: percentile(finals, 95),
    probLoss: finals.filter((v) => v < start).length / sims,
    expectedReturn: start > 0 ? percentile(finals, 50) / start - 1 : 0,
  };
}
