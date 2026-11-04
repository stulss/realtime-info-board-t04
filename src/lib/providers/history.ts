import { fetchJson, ProviderHttpError } from "@/lib/server/http";
import { DEFAULT_PLACE, placeKey, type Place } from "@/lib/location";
import { resolveRange } from "@/lib/history/range";

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

/* ---------- 환율(키 없는 국제 참조환율) ---------- */

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
    .map((row) => ({ metricKey: "fx:USD", label: "USD/KRW 참조환율", unit: "KRW", date: row.date, value: row.rate, sourceTimestamp: stamp(row.date) }));
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
