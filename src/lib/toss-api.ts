import axios from "axios";

const BASE_URL = "https://openapi.tossinvest.com";

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const res = await axios.post(
    `${BASE_URL}/oauth2/token`,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.TOSS_CLIENT_ID!,
      client_secret: process.env.TOSS_CLIENT_SECRET!,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  cachedToken = {
    token: res.data.access_token,
    expiresAt: Date.now() + res.data.expires_in * 1000,
  };

  return cachedToken.token;
}

export async function tossGet<T>(path: string, params?: Record<string, string | number>, accountSeq?: string, retry = false): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (accountSeq) headers["X-Tossinvest-Account"] = accountSeq;
  try {
    const res = await axios.get(`${BASE_URL}${path}`, { params, headers });
    return res.data;
  } catch (e: unknown) {
    // 토큰 만료/무효(401) 시 캐시 비우고 1회 재시도
    if (!retry && axios.isAxiosError(e) && e.response?.status === 401) {
      clearTokenCache();
      return tossGet<T>(path, params, accountSeq, true);
    }
    throw e;
  }
}

export async function tossPost<T>(path: string, body: unknown, accountSeq?: string, retry = false): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (accountSeq) headers["X-Tossinvest-Account"] = accountSeq;
  try {
    const res = await axios.post(`${BASE_URL}${path}`, body, { headers });
    return res.data;
  } catch (e: unknown) {
    if (!retry && axios.isAxiosError(e) && e.response?.status === 401) {
      clearTokenCache();
      return tossPost<T>(path, body, accountSeq, true);
    }
    throw e;
  }
}

/** 토큰 캐시를 강제 무효화 (디버그용) */
export function clearTokenCache() {
  cachedToken = null;
}
