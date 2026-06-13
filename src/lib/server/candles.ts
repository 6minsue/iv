// 서버 전용: 토스 API에서 캔들을 가져와 정규화 (오름차순). 401 시 토큰 갱신 후 1회 재시도.
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

// 토스 캔들 API는 count 최대 200 제약이 있어 안전하게 클램프한다.
const MAX_CANDLES = 200;

// 레이트리밋 완화 + 반복 백테스트 가속을 위한 짧은 메모리 캐시
const cache = new Map<string, { ts: number; bars: Bar[] }>();
const TTL = 60_000; // 60초

export async function fetchCandlesServer(
  symbol: string,
  interval = "1d",
  count = 200
): Promise<Bar[]> {
  const safeCount = Math.min(Math.max(Math.floor(count), 1), MAX_CANDLES);
  const cacheKey = `${symbol}|${interval}|${safeCount}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL) return hit.bars;

  const run = async (retry = false): Promise<Bar[]> => {
    try {
      const data = await tossGet<unknown>("/api/v1/candles", { symbol, interval, count: safeCount });
      const result = (data as { result?: { candles?: TossCandle[] } | TossCandle[] }).result;
      const raw: TossCandle[] = Array.isArray(result)
        ? result
        : (result as { candles?: TossCandle[] })?.candles ?? [];
      return raw
        .map((c) => ({
          time: c.timestamp ?? c.time ?? c.date ?? "",
          open: Number(c.openPrice),
          high: Number(c.highPrice),
          low: Number(c.lowPrice),
          close: Number(c.closePrice),
          volume: Number(c.volume),
        }))
        .filter((b) => Number.isFinite(b.close) && b.close > 0)
        .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.status === 401 && !retry) {
        clearTokenCache();
        return run(true);
      }
      throw e;
    }
  };
  const bars = await run();
  cache.set(cacheKey, { ts: Date.now(), bars });
  return bars;
}
