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

export async function tossGet<T>(path: string, params?: Record<string, string | number>, accountSeq?: string): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (accountSeq) headers["X-Tossinvest-Account"] = accountSeq;

  const res = await axios.get(`${BASE_URL}${path}`, { params, headers });
  return res.data;
}

export async function tossPost<T>(path: string, body: unknown, accountSeq?: string): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (accountSeq) headers["X-Tossinvest-Account"] = accountSeq;

  const res = await axios.post(`${BASE_URL}${path}`, body, { headers });
  return res.data;
}

/** 토큰 캐시를 강제 무효화 (디버그용) */
export function clearTokenCache() {
  cachedToken = null;
}
