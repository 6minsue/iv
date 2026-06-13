// 서버 캔들 데이터 레이어
// - Toss는 interval=1m/1d, count≤200만 지원하지만 `before`(ISO) 커서로 과거 페이지네이션 가능
// - 일봉을 배치로 모아 200개 한계를 넘기고(최대 ~1000), 미지원 주기는 리샘플링으로 생성
import { tossGet, clearTokenCache } from "@/lib/toss-api";
import type { Bar } from "@/lib/quant/types";
import axios from "axios";

interface TossCandle {
  timestamp?: string;
  time?: string;
  date?: string;
  openPrice?: string;
  highPrice?: string;
  lowPrice?: string;
  closePrice?: string;
  volume?: string;
}

const MAX_PER_REQ = 200;
const MAX_TOTAL = 1000;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const cache = new Map<string, { ts: number; bars: Bar[] }>();
const TTL = 60_000;

function parsePage(data: unknown): Bar[] {
  const result = (data as { result?: { candles?: TossCandle[] } | TossCandle[] }).result;
  const raw: TossCandle[] = Array.isArray(result) ? result : (result as { candles?: TossCandle[] })?.candles ?? [];
  return raw
    .map((c) => ({
      time: c.timestamp ?? c.time ?? c.date ?? "",
      open: Number(c.openPrice),
      high: Number(c.highPrice),
      low: Number(c.lowPrice),
      close: Number(c.closePrice),
      volume: Number(c.volume),
    }))
    .filter((b) => Number.isFinite(b.close) && b.close > 0 && b.time)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

async function fetchOnePage(symbol: string, baseInterval: "1m" | "1d", before?: string): Promise<Bar[]> {
  const run = async (retry = false): Promise<Bar[]> => {
    try {
      const params: Record<string, string | number> = { symbol, interval: baseInterval, count: MAX_PER_REQ };
      if (before) params.before = before;
      const data = await tossGet<unknown>("/api/v1/candles", params);
      return parsePage(data);
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.status === 401 && !retry) {
        clearTokenCache();
        return run(true);
      }
      throw e;
    }
  };
  return run();
}

/** 기본 주기(1m/1d) 원본 캔들을 before 커서로 배치 수집 */
async function fetchRaw(symbol: string, baseInterval: "1m" | "1d", count: number): Promise<Bar[]> {
  const target = Math.min(Math.max(Math.floor(count), 1), MAX_TOTAL);
  const key = `${symbol}|${baseInterval}|${target}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.bars;

  const collected: Bar[] = [];
  let before: string | undefined;
  let pages = 0;
  const maxPages = Math.ceil(target / MAX_PER_REQ) + 1;

  while (collected.length < target && pages < maxPages) {
    const batch = await fetchOnePage(symbol, baseInterval, before);
    if (batch.length === 0) break;
    collected.push(...batch);
    before = batch[0].time; // 배치는 오름차순 → 첫 봉이 가장 과거. 그 이전을 다음 페이지로.
    pages++;
    if (batch.length < MAX_PER_REQ) break; // 더 이상 과거 없음
    if (collected.length < target) await delay(280); // 레이트리밋 보호
  }

  // 중복 제거 + 정렬 + 최근 target개
  const byTime = new Map<string, Bar>();
  for (const b of collected) byTime.set(b.time, b);
  const sorted = [...byTime.values()].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const out = sorted.slice(Math.max(0, sorted.length - target));
  cache.set(key, { ts: Date.now(), bars: out });
  return out;
}

/** ISO 주차 키 (월요일 기준) */
function weekKey(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7; // 월=0
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - day);
  return monday.toISOString().slice(0, 10);
}

function aggregate(group: Bar[], time: string): Bar {
  return {
    time,
    open: group[0].open,
    high: Math.max(...group.map((g) => g.high)),
    low: Math.min(...group.map((g) => g.low)),
    close: group[group.length - 1].close,
    volume: group.reduce((s, g) => s + g.volume, 0),
  };
}

function resampleWeekly(daily: Bar[]): Bar[] {
  const groups = new Map<string, Bar[]>();
  for (const b of daily) {
    const k = weekKey(b.time);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(b);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([, g]) => aggregate(g, g[g.length - 1].time));
}

function resampleEvery(bars: Bar[], factor: number): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < bars.length; i += factor) {
    const group = bars.slice(i, i + factor);
    if (group.length) out.push(aggregate(group, group[group.length - 1].time));
  }
  return out;
}

/**
 * 표시 주기에 맞는 캔들 반환. 미지원 주기는 기본 주기에서 리샘플링.
 * 지원: 1d, 1w(일봉 리샘플), 1m, 5m/15m(분봉 리샘플)
 */
export async function fetchCandlesServer(symbol: string, interval = "1d", count = 200): Promise<Bar[]> {
  const want = Math.min(Math.max(Math.floor(count), 1), 600);
  switch (interval) {
    case "1d":
      return fetchRaw(symbol, "1d", want);
    case "1w": {
      const daily = await fetchRaw(symbol, "1d", Math.min(want * 5 + 10, MAX_TOTAL));
      return resampleWeekly(daily).slice(-want);
    }
    case "1m":
      return fetchRaw(symbol, "1m", want);
    case "5m": {
      const one = await fetchRaw(symbol, "1m", Math.min(want * 5 + 10, MAX_TOTAL));
      return resampleEvery(one, 5).slice(-want);
    }
    case "15m": {
      const one = await fetchRaw(symbol, "1m", Math.min(want * 15 + 10, MAX_TOTAL));
      return resampleEvery(one, 15).slice(-want);
    }
    default:
      return fetchRaw(symbol, "1d", want);
  }
}
