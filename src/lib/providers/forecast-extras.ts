import type { WidgetPayload } from "@/types/widget";
import { fetchJson, ProviderHttpError } from "@/lib/server/http";
import { kpGrade, uvGrade } from "@/lib/air-grade";
import { toKstDate } from "@/lib/history/daily-log";
import { toKstIso } from "./open-meteo";

/* ---------- Open-Meteo 일간 예보 ---------- */

type Daily = {
  time: string[];
  sunrise: string[];
  sunset: string[];
  uv_index_max: number[];
  precipitation_probability_max: Array<number | null>;
  temperature_2m_max: number[];
  temperature_2m_min: number[];
};

export const forecastSource: WidgetPayload["source"] = {
  provider: "Open-Meteo 일간 예보",
  docsUrl: "https://open-meteo.com/en/docs",
  endpointTemplate: "GET /v1/forecast?latitude=37.5665&longitude=126.978&daily=sunrise,sunset,uv_index_max,...",
  attribution: "Weather data by Open-Meteo.com (CC BY 4.0, 비상업적 이용)",
};

export async function fetchSeoulForecast(): Promise<WidgetPayload> {
  const body = await fetchJson<{ daily: Daily }>(
    "https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978"
    + "&daily=sunrise,sunset,uv_index_max,precipitation_probability_max,temperature_2m_max,temperature_2m_min"
    + "&timezone=Asia%2FSeoul&forecast_days=3",
  );
  const d = body?.daily;
  const ok = d && [d.time, d.sunrise, d.sunset, d.uv_index_max, d.temperature_2m_max, d.temperature_2m_min]
    .every((list) => Array.isArray(list) && list.length >= 2);
  if (!ok || !Number.isFinite(d.temperature_2m_max[0]) || !Number.isFinite(d.temperature_2m_min[0])) {
    throw new ProviderHttpError("Open-Meteo 일간 예보 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  const rain = d.precipitation_probability_max?.[0];
  const tmax = d.temperature_2m_max[0];
  const tmin = d.temperature_2m_min[0];
  return {
    value: {
      headline: `${Math.round(tmax)}° / ${Math.round(tmin)}°`,
      subline: `서울 · ${d.time[0]} 최고 / 최저`,
      trend: "flat",
      metric: { key: "forecast-seoul-tmax", label: "서울 오늘 최고기온(예보)", value: tmax, unit: "°C" },
      facts: { tmax, tmin, uvMax: d.uv_index_max[0], precipProbability: typeof rain === "number" ? rain : 0 },
      details: [
        { label: "일출 / 일몰", value: `${d.sunrise[0].slice(11, 16)} / ${d.sunset[0].slice(11, 16)}` },
        { label: "자외선 최대", value: `${d.uv_index_max[0]} (${uvGrade(d.uv_index_max[0])})` },
        { label: "강수확률", value: typeof rain === "number" ? `${rain}%` : "정보 없음" },
        { label: "내일", value: `${Math.round(d.temperature_2m_max[1])}° / ${Math.round(d.temperature_2m_min[1])}°` },
      ],
    },
    status: "ok",
    source: forecastSource,
    sourceTimestamp: toKstIso(`${d.time[0]}T00:00`),
    fetchedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    cacheAgeMs: 0,
  };
}

/* ---------- Nager.Date 한국 공휴일 ---------- */

type Holiday = { date: string; localName: string; name: string };

export const holidaySource: WidgetPayload["source"] = {
  provider: "Nager.Date",
  docsUrl: "https://date.nager.at/Api",
  endpointTemplate: "GET /api/v3/NextPublicHolidays/KR",
  attribution: "Nager.Date 공휴일 API",
};

/** 두 YYYY-MM-DD 사이의 일수(달력 기준). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

export async function fetchNextHoliday(now: Date = new Date()): Promise<WidgetPayload> {
  const list = await fetchJson<Holiday[]>("https://date.nager.at/api/v3/NextPublicHolidays/KR");
  const next = Array.isArray(list) ? list[0] : undefined;
  if (!next || typeof next.date !== "string" || typeof next.localName !== "string") {
    throw new ProviderHttpError("Nager.Date 공휴일 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  const days = daysBetween(toKstDate(now), next.date);
  const weekday = WEEKDAY[new Date(`${next.date}T00:00:00Z`).getUTCDay()];
  return {
    value: {
      headline: days <= 0 ? "D-DAY" : `D-${days}`,
      subline: `${next.localName} · ${next.date} (${weekday})`,
      facts: { daysUntil: days },
      details: [
        { label: "공휴일", value: next.localName },
        { label: "그다음", value: list[1] ? `${list[1].localName} (${list[1].date})` : "정보 없음" },
      ],
    },
    status: "ok",
    source: holidaySource,
    fetchedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    cacheAgeMs: 0,
  };
}

/* ---------- NOAA SWPC 지자기 Kp ---------- */

type KpRow = { time_tag: string; Kp: number };

export const kpSource: WidgetPayload["source"] = {
  provider: "NOAA SWPC",
  docsUrl: "https://www.swpc.noaa.gov/products/planetary-k-index",
  endpointTemplate: "GET /products/noaa-planetary-k-index.json",
  attribution: "NOAA Space Weather Prediction Center (공개 도메인)",
};

export async function fetchKpIndex(): Promise<WidgetPayload> {
  const rows = await fetchJson<KpRow[]>("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json");
  const valid = Array.isArray(rows)
    ? rows.filter((row) => typeof row?.time_tag === "string" && Number.isFinite(Number(row.Kp)))
    : [];
  if (valid.length === 0) {
    throw new ProviderHttpError("NOAA Kp 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  const latest = valid.reduce((best, row) => (row.time_tag > best.time_tag ? row : best));
  const kp = Number(latest.Kp);
  const day = valid.filter((row) => row.time_tag >= latest.time_tag.slice(0, 10)).map((row) => Number(row.Kp));
  return {
    value: {
      headline: `Kp ${kp.toFixed(2)}`,
      subline: `지구 자기장 · ${kpGrade(kp)}`,
      trend: kp >= 5 ? "up" : "flat",
      metric: { key: "noaa-kp", label: "지자기 Kp 지수", value: kp, unit: "Kp" },
      details: [
        { label: "오늘(UTC) 최대", value: Math.max(...day).toFixed(2) },
        { label: "관측 간격", value: "3시간" },
      ],
    },
    status: "ok",
    source: kpSource,
    sourceTimestamp: `${latest.time_tag}Z`,
    fetchedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    cacheAgeMs: 0,
  };
}
