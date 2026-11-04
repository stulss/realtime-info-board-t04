import type { WidgetPayload } from "@/types/widget";
import { fetchJson, ProviderHttpError } from "@/lib/server/http";
import { pm25Grade } from "@/lib/air-grade";
import { weatherLabel } from "@/lib/sky";
import { DEFAULT_PLACE, isInKorea, placeKey, type Place } from "@/lib/location";

export { pm25Grade };


type Current<T> = { utc_offset_seconds?: number; current: { time: string } & T };

export const weatherSource: WidgetPayload["source"] = {
  provider: "Open-Meteo",
  docsUrl: "https://open-meteo.com/en/docs",
  endpointTemplate: "GET /v1/forecast?latitude={lat}&longitude={lon}&current=...&timezone=auto",
  attribution: "Weather data by Open-Meteo.com (CC BY 4.0, 비상업적 이용)",
};

export const airQualitySource: WidgetPayload["source"] = {
  provider: "Open-Meteo Air Quality",
  docsUrl: "https://open-meteo.com/en/docs/air-quality-api",
  endpointTemplate: "GET /v1/air-quality?latitude={lat}&longitude={lon}&current=pm10,pm2_5,us_aqi",
  attribution: "Air quality data by Open-Meteo.com (CAMS 모델, 비상업적 이용)",
};

function isNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** 오프셋(초)을 "+09:00" 형태로 바꾼다. */
export function formatOffset(seconds: number): string {
  const sign = seconds < 0 ? "-" : "+";
  const abs = Math.abs(seconds);
  const hh = String(Math.floor(abs / 3600)).padStart(2, "0");
  const mm = String(Math.floor((abs % 3600) / 60)).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

/** Open-Meteo 로컬 시각("2026-11-03T15:15")을 현지 UTC 오프셋이 붙은 ISO로 바꾼다. 기본은 KST. */
export function toKstIso(local: string, offsetSeconds = 9 * 3600): string {
  return `${local.slice(0, 16)}:00${formatOffset(offsetSeconds)}`;
}

/** 응답에 오프셋이 없으면 한국 안은 KST, 밖은 UTC로 가정한다. */
export function offsetOf(body: { utc_offset_seconds?: number }, place: Place): number {
  return isNum(body.utc_offset_seconds) ? body.utc_offset_seconds : isInKorea(place.lat, place.lon) ? 9 * 3600 : 0;
}

export async function fetchWeather(place: Place = DEFAULT_PLACE): Promise<WidgetPayload> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}`
    + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,is_day&timezone=auto";
  const body = await fetchJson<Current<{
    temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number;
    precipitation: number; weather_code: number; wind_speed_10m: number; is_day?: number;
  }>>(url);
  const c = body?.current;
  if (!c || !isNum(c.temperature_2m) || !isNum(c.weather_code) || typeof c.time !== "string") {
    throw new ProviderHttpError("Open-Meteo 날씨 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  return {
    value: {
      headline: `${c.temperature_2m.toFixed(1)}°C`,
      subline: `${place.name} · ${weatherLabel(c.weather_code)}`,
      metric: { key: `weather-temp@${placeKey(place)}`, label: `${place.name} 기온`, value: c.temperature_2m, unit: "°C" },
      facts: {
        temperature: c.temperature_2m,
        apparent: c.apparent_temperature,
        humidity: c.relative_humidity_2m,
        wind: c.wind_speed_10m,
        weatherCode: c.weather_code,
        isDay: c.is_day === 0 ? 0 : 1,
      },
      details: [
        { label: "체감", value: `${c.apparent_temperature}°C` },
        { label: "습도", value: `${c.relative_humidity_2m}%` },
        { label: "강수", value: `${c.precipitation}mm` },
        { label: "풍속", value: `${c.wind_speed_10m}km/h` },
      ],
    },
    status: "ok",
    source: weatherSource,
    sourceTimestamp: toKstIso(c.time, offsetOf(body, place)),
    fetchedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    cacheAgeMs: 0,
  };
}

export async function fetchAirQuality(place: Place = DEFAULT_PLACE): Promise<WidgetPayload> {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.lat}&longitude=${place.lon}`
    + "&current=pm10,pm2_5,us_aqi&timezone=auto";
  const body = await fetchJson<Current<{ pm10: number; pm2_5: number; us_aqi: number }>>(url);
  const c = body?.current;
  if (!c || !isNum(c.pm2_5) || !isNum(c.pm10) || typeof c.time !== "string") {
    throw new ProviderHttpError("Open-Meteo 대기질 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  return {
    value: {
      headline: `PM2.5 ${c.pm2_5.toFixed(1)} μg/m³`,
      subline: `${place.name} · ${pm25Grade(c.pm2_5)} (한국 기준 등급, 모델값)`,
      trend: c.pm2_5 > 35 ? "up" : "flat",
      facts: { pm25: c.pm2_5, pm10: c.pm10 },
      metric: { key: `airquality-pm25@${placeKey(place)}`, label: `${place.name} PM2.5(모델)`, value: c.pm2_5, unit: "μg/m³" },
      details: [
        { label: "PM10", value: `${c.pm10} μg/m³` },
        ...(isNum(c.us_aqi) ? [{ label: "US AQI", value: String(c.us_aqi) }] : []),
      ],
    },
    status: "ok",
    source: airQualitySource,
    sourceTimestamp: toKstIso(c.time, offsetOf(body, place)),
    fetchedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    cacheAgeMs: 0,
  };
}
