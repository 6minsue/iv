// 현대 포트폴리오 이론 (Markowitz 1952, 평균-분산 최적화)
// 몬테카를로 무작위 가중치로 효율적 투자선을 추정하고, 최대샤프(접점)·최소분산 포트폴리오를 찾는다.
// 롱온리, 가중치 합=1, 무레버리지. 일별수익률 행렬 입력.

const PPY = 252;

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MPTAsset {
  symbol: string;
  expReturn: number;   // 연율 기대수익
  volatility: number;  // 연율 변동성
  currentWeight: number;
  maxSharpeWeight: number;
  minVolWeight: number;
}
export interface FrontierPoint { ret: number; vol: number; sharpe: number; }
export interface MPTPortfolio { ret: number; vol: number; sharpe: number; weights: number[] }
export interface MPTResult {
  assets: MPTAsset[];
  correlation: number[][];
  frontier: FrontierPoint[];
  current: MPTPortfolio;
  maxSharpe: MPTPortfolio;
  minVol: MPTPortfolio;
}

function mean(a: number[]) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

/**
 * @param symbols  자산 심볼
 * @param returns  returns[asset][t] 일별수익률 (모든 자산 동일 길이로 정렬됨)
 * @param currentWeights 현재 비중 (합 1)
 */
export function computeMPT(symbols: string[], returns: number[][], currentWeights: number[], sims = 4000, seed = 11): MPTResult | null {
  const N = symbols.length;
  if (N < 2) return null;
  const T = Math.min(...returns.map((r) => r.length));
  if (T < 20) return null;
  // 길이 정렬 (뒤에서 T개)
  const R = returns.map((r) => r.slice(r.length - T));

  const mu = R.map((r) => mean(r)); // 일평균
  // 공분산 (일별)
  const cov: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      let s = 0;
      for (let t = 0; t < T; t++) s += (R[i][t] - mu[i]) * (R[j][t] - mu[j]);
      const c = s / T;
      cov[i][j] = c; cov[j][i] = c;
    }
  }
  const std = cov.map((row, i) => Math.sqrt(Math.max(row[i], 0)));
  const correlation: number[][] = Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) => (std[i] > 0 && std[j] > 0 ? cov[i][j] / (std[i] * std[j]) : i === j ? 1 : 0))
  );

  const portStats = (w: number[]): MPTPortfolio => {
    let ret = 0;
    for (let i = 0; i < N; i++) ret += w[i] * mu[i];
    let varc = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) varc += w[i] * w[j] * cov[i][j];
    const volA = Math.sqrt(Math.max(varc, 0)) * Math.sqrt(PPY);
    const retA = ret * PPY;
    return { ret: retA, vol: volA, sharpe: volA > 0 ? retA / volA : 0, weights: w };
  };

  const rand = mulberry32(seed);
  const frontier: FrontierPoint[] = [];
  let maxSharpe = portStats(Array(N).fill(1 / N));
  let minVol = maxSharpe;
  for (let k = 0; k < sims; k++) {
    // Dirichlet(1) ~ 지수분포 정규화 → 롱온리 심플렉스
    const raw = Array.from({ length: N }, () => -Math.log(1 - rand() * 0.999999));
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    const w = raw.map((x) => x / sum);
    const p = portStats(w);
    if (k % Math.max(1, Math.floor(sims / 400)) === 0) frontier.push({ ret: p.ret, vol: p.vol, sharpe: p.sharpe });
    if (p.sharpe > maxSharpe.sharpe) maxSharpe = p;
    if (p.vol < minVol.vol) minVol = p;
  }

  const current = portStats(currentWeights.length === N ? currentWeights : Array(N).fill(1 / N));

  const assets: MPTAsset[] = symbols.map((s, i) => ({
    symbol: s,
    expReturn: mu[i] * PPY,
    volatility: std[i] * Math.sqrt(PPY),
    currentWeight: current.weights[i] ?? 0,
    maxSharpeWeight: maxSharpe.weights[i] ?? 0,
    minVolWeight: minVol.weights[i] ?? 0,
  }));

  return { assets, correlation, frontier, current, maxSharpe, minVol };
}
