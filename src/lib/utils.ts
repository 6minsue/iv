import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString("ko-KR", { maximumFractionDigits: decimals });
}

export function formatChange(change: number, changeRate: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${formatNumber(change)} (${sign}${changeRate.toFixed(2)}%)`;
}

export function priceColor(change: number): string {
  if (change > 0) return "text-red-400";
  if (change < 0) return "text-blue-400";
  return "text-slate-400";
}

/** 비율(소수) → 퍼센트 문자열. 0.1234 → "+12.34%" */
export function pct(fraction: number, decimals = 2): string {
  const v = fraction * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}

/** 큰 금액 압축 표기 (원화 가정). 102650918 → "1.03억" */
export function compactKRW(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${(n / 1e8).toFixed(2)}억`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(0)}만`;
  return formatNumber(n);
}
