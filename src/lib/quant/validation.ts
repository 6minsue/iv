// 백테스트 신뢰성 검증 (López de Prado / Bailey)
// - CSCV 기반 PBO (Probability of Backtest Overfitting)
// - DSR (Deflated Sharpe Ratio), PSR (Probabilistic Sharpe Ratio)
// 제한된 데이터에서 "여러 전략 중 최고를 고르는" 선택편향을 정량화한다.

const EULER = 0.5772156649015329;

/** 표준정규 CDF (Abramowitz-Stegun erf 근사) */
export function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-(x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/** 표준정규 역함수 (Acklam 근사) */
export function normalInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number, r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}
export function skewness(xs: number[]): number {
  const s = std(xs);
  if (s === 0) return 0;
  const m = mean(xs);
  return xs.reduce((a, b) => a + ((b - m) / s) ** 3, 0) / xs.length;
}
export function kurtosis(xs: number[]): number {
  const s = std(xs);
  if (s === 0) return 3;
  const m = mean(xs);
  return xs.reduce((a, b) => a + ((b - m) / s) ** 4, 0) / xs.length;
}

/** 주기 단위 샤프 (비연율) */
export function sharpePerPeriod(returns: number[]): number {
  const s = std(returns);
  return s === 0 ? 0 : mean(returns) / s;
}

/** PSR: 관측 샤프가 기준 샤프를 초과할 확률 */
export function probabilisticSharpe(sr: number, n: number, skew: number, kurt: number, srRef = 0): number {
  if (n < 2) return 0.5;
  const denom = Math.sqrt(Math.max(1e-9, 1 - skew * sr + ((kurt - 1) / 4) * sr * sr));
  const z = ((sr - srRef) * Math.sqrt(n - 1)) / denom;
  return normalCDF(z);
}

export interface DSRResult {
  bestSharpe: number;
  expectedMaxSharpe: number; // SR0
  dsr: number; // 0~1, 높을수록 신뢰
  trials: number;
}

/**
 * DSR: N개 시도 중 최고 샤프가 선택편향을 감안해도 유의한지.
 * @param perPeriodSharpes 각 시도(설정)의 주기단위 샤프
 * @param T 관측 수 (봉 수)
 * @param skew,kurt 수익률 분포 (최고 전략 기준)
 */
export function deflatedSharpe(perPeriodSharpes: number[], T: number, skew: number, kurt: number): DSRResult {
  const N = perPeriodSharpes.length;
  const bestSharpe = Math.max(...perPeriodSharpes);
  const varSR = N > 1 ? std(perPeriodSharpes) ** 2 : 0;
  const sqrtVar = Math.sqrt(Math.max(varSR, 1e-12));
  // 기대 최대 샤프 (Gumbel 근사)
  const sr0 =
    N > 1
      ? sqrtVar * ((1 - EULER) * normalInv(1 - 1 / N) + EULER * normalInv(1 - 1 / (N * Math.E)))
      : 0;
  const dsr = probabilisticSharpe(bestSharpe, T, skew, kurt, sr0);
  return { bestSharpe, expectedMaxSharpe: sr0, dsr, trials: N };
}

/** k개 원소 조합 인덱스 생성 */
function combinations(n: number, k: number): number[][] {
  const result: number[][] = [];
  const combo: number[] = [];
  const rec = (start: number) => {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < n; i++) {
      combo.push(i);
      rec(i + 1);
      combo.pop();
    }
  };
  rec(0);
  return result;
}

export interface PBOResult {
  pbo: number; // 과적합 확률 0~1
  combinations: number; // 평가한 조합 수
  logits: number[];
  medianLogit: number;
}

/**
 * CSCV(조합형 대칭 교차검증) 기반 PBO.
 * @param returnsMatrix [시간 T][전략 N] 수익률 행렬
 * @param groups S (짝수). T를 S개 그룹으로 나눠 C(S, S/2) 조합 평가.
 */
export function cscvPBO(returnsMatrix: number[][], groups = 8): PBOResult {
  const T = returnsMatrix.length;
  const N = returnsMatrix[0]?.length ?? 0;
  const S = Math.min(groups % 2 === 0 ? groups : groups - 1, Math.floor(T / 2) * 2);
  if (N < 2 || S < 2 || T < S) {
    return { pbo: 0, combinations: 0, logits: [], medianLogit: 0 };
  }

  // T 행을 S개 연속 그룹으로 분할
  const groupSize = Math.floor(T / S);
  const groupRows: number[][] = [];
  for (let g = 0; g < S; g++) {
    const startRow = g * groupSize;
    const endRow = g === S - 1 ? T : startRow + groupSize;
    const rows: number[] = [];
    for (let r = startRow; r < endRow; r++) rows.push(r);
    groupRows.push(rows);
  }

  const sharpeOnRows = (rows: number[], strat: number): number => {
    const rs = rows.map((r) => returnsMatrix[r][strat]);
    return sharpePerPeriod(rs);
  };

  const combos = combinations(S, S / 2);
  const logits: number[] = [];
  let overfit = 0;

  for (const isGroups of combos) {
    const isSet = new Set(isGroups);
    const isRows: number[] = [];
    const oosRows: number[] = [];
    for (let g = 0; g < S; g++) {
      if (isSet.has(g)) isRows.push(...groupRows[g]);
      else oosRows.push(...groupRows[g]);
    }
    // IS 최고 전략
    let bestStrat = 0;
    let bestSR = -Infinity;
    for (let s = 0; s < N; s++) {
      const sr = sharpeOnRows(isRows, s);
      if (sr > bestSR) {
        bestSR = sr;
        bestStrat = s;
      }
    }
    // OOS에서 best 전략의 상대순위
    const oosSR = Array.from({ length: N }, (_, s) => sharpeOnRows(oosRows, s));
    const sorted = [...oosSR].sort((a, b) => a - b);
    const rank = sorted.indexOf(oosSR[bestStrat]) + 1; // 1..N
    const omega = rank / (N + 1);
    const lambda = Math.log(omega / (1 - omega));
    logits.push(lambda);
    if (lambda <= 0) overfit++; // 중앙값 이하 → 과적합
  }

  const sortedLogits = [...logits].sort((a, b) => a - b);
  const medianLogit = sortedLogits.length
    ? sortedLogits[Math.floor(sortedLogits.length / 2)]
    : 0;

  return {
    pbo: combos.length ? overfit / combos.length : 0,
    combinations: combos.length,
    logits,
    medianLogit,
  };
}
