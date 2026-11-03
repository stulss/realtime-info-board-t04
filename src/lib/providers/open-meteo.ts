import type { WidgetPayload } from "@/types/widget";
import { fetchJson, ProviderHttpError } from "@/lib/server/http";
import { pm25Grade } from "@/lib/air-grade";

export { pm25Grade };

/** 서울 시청 좌표 */
const LAT = 37.5665;
const LON = 126.978;

const WMO: Record<number, string> = {
  0: "맑음", 1: "대체로 맑음", 2: "구름 조금", 3: "흐림", 45: "안개", 48: "서리 안개",
  51: "약한 이슬비", 53: "이슬비", 55: "강한 이슬비", 61: "약한 비", 63: "비", 65: "강한 비",
  71: "약한 눈", 73: "눈", 75: "강한 눈", 80: "소나기", 81: "강한 소나기", 82: "매우 강한 소나기",
  95: "뇌우", 96: "우박 동반 뇌우", 99: "강한 우박 동반 뇌우",
};

type Current<T> = { current: { time: string } & T };

export const weatherSource: WidgetPayload["source"] = {
  provider: "Open-Meteo",
  docsUrl: "https://open-meteo.com/en/docs",
  endpointTemplate: "GET /v1/forecast?latitude=37.5665&longitude=126.978&current=...",
  attribution: "Weather data by Open-Meteo.com (CC BY 4.0, 비상업적 이용)",
};

export const airQualitySource: WidgetPayload["source"] = {
  provider: "Open-Meteo Air Quality",
  docsUrl: "https://open-meteo.com/en/docs/air-quality-api",
  endpointTemplate: "GET /v1/air-quality?latitude=37.5665&longitude=126.978&current=pm10,pm2_5,us_aqi",
  attribution: "Air quality data by Open-Meteo.com (CAMS 모델, 비상업적 이용)",
};

function isNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Open-Meteo `timezone=Asia/Seoul` 로컬 시각("2026-11-03T15:15")을 KST ISO로 바꾼다. */
export function toKstIso(local: string): string {
  return `${local.slice(0, 16)}:00+09:00`;
}

export async function fetchSeoulWeather(): Promise<WidgetPayload> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}`
    + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&timezone=Asia%2FSeoul";
  const body = await fetchJson<Current<{
    temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number;
    precipitation: number; weather_code: number; wind_speed_10m: number;
  }>>(url);
  const c = body?.current;
  if (!c || !isNum(c.temperature_2m) || !isNum(c.weather_code) || typeof c.time !== "string") {
    throw new ProviderHttpError("Open-Meteo 날씨 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  return {
    value: {
      headline: `${c.temperature_2m.toFixed(1)}°C`,
      subline: `서울 · ${WMO[c.weather_code] ?? `날씨 코드 ${c.weather_code}`}`,
      metric: { key: "weather-seoul-temp", label: "서울 기온", value: c.temperature_2m, unit: "°C" },
      facts: { temperature: c.temperature_2m },
      details: [
        { label: "체감", value: `${c.apparent_temperature}°C` },
        { label: "습도", value: `${c.relative_humidity_2m}%` },
        { label: "강수", value: `${c.precipitation}mm` },
        { label: "풍속", value: `${c.wind_speed_10m}km/h` },
      ],
    },
    status: "ok",
    source: weatherSource,
    sourceTimestamp: toKstIso(c.time),
    fetchedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    cacheAgeMs: 0,
  };
}

export async function fetchSeoulAirQuality(): Promise<WidgetPayload> {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}`
    + "&current=pm10,pm2_5,us_aqi&timezone=Asia%2FSeoul";
  const body = await fetchJson<Current<{ pm10: number; pm2_5: number; us_aqi: number }>>(url);
  const c = body?.current;
  if (!c || !isNum(c.pm2_5) || !isNum(c.pm10) || typeof c.time !== "string") {
    throw new ProviderHttpError("Open-Meteo 대기질 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  return {
    value: {
      headline: `PM2.5 ${c.pm2_5.toFixed(1)} μg/m³`,
      subline: `서울 · ${pm25Grade(c.pm2_5)} (한국 기준 등급, 모델값)`,
      trend: c.pm2_5 > 35 ? "up" : "flat",
      facts: { pm25: c.pm2_5, pm10: c.pm10 },
      metric: { key: "airquality-seoul-pm25", label: "서울 PM2.5(모델)", value: c.pm2_5, unit: "μg/m³" },
      details: [
        { label: "PM10", value: `${c.pm10} μg/m³` },
        ...(isNum(c.us_aqi) ? [{ label: "US AQI", value: String(c.us_aqi) }] : []),
      ],
    },
    status: "ok",
    source: airQualitySource,
    sourceTimestamp: toKstIso(c.time),
    fetchedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    cacheAgeMs: 0,
  };
}
