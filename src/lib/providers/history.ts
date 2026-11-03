import { fetchJson, ProviderHttpError } from "@/lib/server/http";
import { DEFAULT_PLACE, placeKey, type Place } from "@/lib/location";
import { addDays, daysBetweenDates, kstToday, resolveRange } from "@/lib/history/range";

/** 공급자가 확정해 준 "그날의 값" 한 건. 클라이언트가 날짜별 기록에 그대로 채운다. */
export type HistoryPoint = {
  metricKey: string;
  label: string;
  unit: string;
  date: string;
  value: number;
  min?: number;
  max?: number;
  sourceTimestamp: string;
};

export type HistorySourceStatus = { name: string; ok: boolean; count: number; error?: string };

export type HistoryResponse = {
  from: string;
  to: string;
  fetchedAt: string;
  points: HistoryPoint[];
  sources: HistorySourceStatus[];
};

const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const stamp = (date: string) => `${date}T00:00:00.000Z`;

/** 어제(KST)까지만 쓴다. 오늘은 실시간 기록이 이어받는다. */
function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

/* ---------- 내 위치 날씨·대기질 (Open-Meteo) ---------- */

type DailyWeather = {
  daily?: {
    time?: string[];
    temperature_2m_mean?: Array<number | null>;
    temperature_2m_max?: Array<number | null>;
    temperature_2m_min?: Array<number | null>;
  };
};

export async function weatherHistory(place: Place, from: string, to: string): Promise<HistoryPoint[]> {
  const body = await fetchJson<DailyWeather>(
    `https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}`
    + `&start_date=${from}&end_date=${to}&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min&timezone=auto`,
    { timeoutMs: 15_000 },
  );
  const d = body?.daily;
  if (!d?.time || !Array.isArray(d.temperature_2m_mean)) {
    throw new ProviderHttpError("Open-Meteo 과거 날씨 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  const key = placeKey(place);
  const points: HistoryPoint[] = [];
  d.time.forEach((date, index) => {
    const avg = d.temperature_2m_mean?.[index];
    const lo = d.temperature_2m_min?.[index];
    const hi = d.temperature_2m_max?.[index];
    if (!isNum(avg) || !inRange(date, from, to)) return;
    const range = { min: isNum(lo) ? lo : undefined, max: isNum(hi) ? hi : undefined };
    points.push({ metricKey: `weather-temp@${key}`, label: `${place.name} 기온`, unit: "°C", date, value: round(avg, 1), ...range, sourceTimestamp: stamp(date) });
    if (isNum(hi)) {
      points.push({ metricKey: `forecast-tmax@${key}`, label: `${place.name} 오늘 최고기온(예보)`, unit: "°C", date, value: round(hi, 1), sourceTimestamp: stamp(date) });
    }
  });
  return points;
}

type HourlyAir = { hourly?: { time?: string[]; pm2_5?: Array<number | null> } };

export async function airQualityHistory(place: Place, from: string, to: string): Promise<HistoryPoint[]> {
  const body = await fetchJson<HourlyAir>(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.lat}&longitude=${place.lon}`
    + `&hourly=pm2_5&start_date=${from}&end_date=${to}&timezone=auto`,
    { timeoutMs: 15_000 },
  );
  const h = body?.hourly;
  if (!h?.time || !Array.isArray(h.pm2_5)) {
    throw new ProviderHttpError("Open-Meteo 과거 대기질 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  const byDate = new Map<string, number[]>();
  h.time.forEach((time, index) => {
    const value = h.pm2_5?.[index];
    if (!isNum(value)) return;
    const date = time.slice(0, 10);
    byDate.set(date, [...(byDate.get(date) ?? []), value]);
  });
  const points: HistoryPoint[] = [];
  for (const [date, values] of byDate) {
    if (values.length < 12 || !inRange(date, from, to)) continue; // 하루의 절반 미만이면 신뢰하지 않는다
    points.push({
      metricKey: `airquality-pm25@${placeKey(place)}`, label: `${place.name} PM2.5(모델)`, unit: "μg/m³", date,
      value: round(mean(values), 1), min: round(Math.min(...values), 1), max: round(Math.max(...values), 1), sourceTimestamp: stamp(date),
    });
  }
  return points;
}

/* ---------- 전 세계 공통 지표 ---------- */

const USGS_LIMIT = 20_000;

export async function earthquakeHistory(from: string, to: string): Promise<HistoryPoint[]> {
  const end = addDays(to, 2); // KST 날짜 경계를 덮도록 여유를 둔다
  const url = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&minmagnitude=2.5&orderby=time"
    + `&starttime=${addDays(from, -1)}&endtime=${end}&limit=${USGS_LIMIT}`;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new ProviderHttpError("USGS 과거 지진 목록에 연결할 수 없습니다.", undefined, undefined, "offline");
  }
  if (!response.ok) throw new ProviderHttpError(`USGS가 HTTP ${response.status}을 반환했습니다.`, response.status);
  const lines = (await response.text()).trim().split("\n");
  if (!lines[0]?.startsWith("time,")) {
    throw new ProviderHttpError("USGS 과거 지진 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  const counts = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const time = line.slice(0, line.indexOf(","));
    const parsed = Date.parse(time);
    if (Number.isNaN(parsed)) continue;
    const date = kstToday(new Date(parsed));
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  // 한도에 걸렸으면 가장 오래된 날은 일부만 담겼을 수 있어 제외한다.
  const truncated = lines.length - 1 >= USGS_LIMIT;
  const oldest = [...counts.keys()].sort()[0];
  const points: HistoryPoint[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (truncated && date <= oldest) continue;
    points.push({ metricKey: "usgs-quake-count", label: "전 세계 M2.5+ 지진 수(24h)", unit: "건", date, value: counts.get(date) ?? 0, sourceTimestamp: stamp(date) });
  }
  return points;
}

type KpBody = { Kp?: number[]; datetime?: string[] };

export async function kpHistory(from: string, to: string): Promise<HistoryPoint[]> {
  const body = await fetchJson<KpBody>(
    `https://kp.gfz.de/app/json/?start=${from}T00:00:00Z&end=${to}T23:59:59Z&index=Kp`,
    { timeoutMs: 15_000 },
  );
  if (!Array.isArray(body?.Kp) || !Array.isArray(body?.datetime) || body.Kp.length !== body.datetime.length) {
    throw new ProviderHttpError("GFZ Kp 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  const byDate = new Map<string, number[]>();
  body.datetime.forEach((time, index) => {
    const value = body.Kp![index];
    if (!isNum(value)) return;
    const date = time.slice(0, 10);
    byDate.set(date, [...(byDate.get(date) ?? []), value]);
  });
  const points: HistoryPoint[] = [];
  for (const [date, values] of byDate) {
    if (!inRange(date, from, to)) continue;
    points.push({ metricKey: "noaa-kp", label: "지자기 Kp 지수", unit: "Kp", date, value: round(mean(values)), min: round(Math.min(...values)), max: round(Math.max(...values)), sourceTimestamp: stamp(date) });
  }
  return points;
}

export async function ethHistory(from: string, to: string, now: Date = new Date()): Promise<HistoryPoint[]> {
  const days = daysBetweenDates(from, kstToday(now)) + 1;
  const body = await fetchJson<{ prices?: Array<[number, number]> }>(
    `https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=${Math.min(365, Math.max(2, days))}&interval=daily`,
    { retries: 1, timeoutMs: 15_000 },
  );
  if (!Array.isArray(body?.prices)) {
    throw new ProviderHttpError("CoinGecko 과거 가격 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  const points: HistoryPoint[] = [];
  for (const [timestamp, price] of body.prices) {
    if (!isNum(timestamp) || !isNum(price)) continue;
    const date = new Date(timestamp).toISOString().slice(0, 10); // 일별 값은 UTC 0시 기준
    if (!inRange(date, from, to)) continue;
    points.push({ metricKey: "coingecko-eth-usd", label: "ETH/USD", unit: "USD", date, value: round(price), sourceTimestamp: new Date(timestamp).toISOString() });
  }
  return points;
}

export async function usdKrwHistory(from: string, to: string): Promise<HistoryPoint[]> {
  const rows = await fetchJson<Array<{ date: string; rate: number }>>(
    `https://api.frankfurter.dev/v2/rates?from=${from}&to=${to}&base=USD&quotes=KRW`,
    { timeoutMs: 15_000 },
  );
  if (!Array.isArray(rows)) {
    throw new ProviderHttpError("Frankfurter 과거 환율 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  return rows
    .filter((row) => typeof row?.date === "string" && isNum(row.rate) && inRange(row.date, from, to))
    .map((row) => ({ metricKey: "frankfurter-usd-krw", label: "USD/KRW 참조환율", unit: "KRW", date: row.date, value: row.rate, sourceTimestamp: stamp(row.date) }));
}

/* ---------- 합치기 + 서버 캐시 ---------- */

const TTL_MS = 6 * 60 * 60_000;
const MAX_ENTRIES = 200;
const cache = new Map<string, { data: HistoryResponse; expiresAt: number }>();
const inFlight = new Map<string, Promise<HistoryResponse>>();

/** 일부 공급자가 실패해도 나머지는 채운다. 실패한 출처는 sources에 이유와 함께 남긴다. */
export async function buildHistory(place: Place, fromParam: string | null, now: Date = new Date()): Promise<HistoryResponse> {
  const { from, to } = resolveRange(fromParam, now);
  const jobs: Array<[string, () => Promise<HistoryPoint[]>]> = [
    ["Open-Meteo 기온", () => weatherHistory(place, from, to)],
    ["Open-Meteo 대기질", () => airQualityHistory(place, from, to)],
    ["USGS 지진", () => earthquakeHistory(from, to)],
    ["GFZ 지자기 Kp", () => kpHistory(from, to)],
    ["CoinGecko ETH/USD", () => ethHistory(from, to, now)],
    ["Frankfurter USD/KRW", () => usdKrwHistory(from, to)],
  ];
  const settled = await Promise.allSettled(jobs.map(([, job]) => job()));
  const points: HistoryPoint[] = [];
  const sources: HistorySourceStatus[] = settled.map((result, index) => {
    const name = jobs[index][0];
    if (result.status === "fulfilled") {
      points.push(...result.value);
      return { name, ok: true, count: result.value.length };
    }
    return { name, ok: false, count: 0, error: result.reason instanceof Error ? result.reason.message : "알 수 없는 오류" };
  });
  return { from, to, fetchedAt: new Date().toISOString(), points, sources };
}

export async function getHistory(place: Place = DEFAULT_PLACE, fromParam: string | null = null, now: Date = new Date()): Promise<HistoryResponse> {
  const { from, to } = resolveRange(fromParam, now);
  const key = `${place.lat},${place.lon}:${place.name}:${from}:${to}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = buildHistory(place, fromParam, now)
    .then((data) => {
      // 전부 실패한 응답은 캐시하지 않아 다음 요청에서 다시 시도한다.
      if (data.sources.some((source) => source.ok)) {
        if (!cache.has(key) && cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
        cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
      }
      return data;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}
