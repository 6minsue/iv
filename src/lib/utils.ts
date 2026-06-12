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
