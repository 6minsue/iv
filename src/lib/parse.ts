/** API 응답에서 배열을 안전하게 추출 — 키 이름이 달라도 처리 */
export function extractArray<T>(data: unknown, ...keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    for (const key of keys) {
      const val = (data as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val as T[];
    }
    // 객체 값 중에 배열이 있으면 첫 번째 반환
    for (const val of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(val)) return val as T[];
    }
  }
  return [];
}
