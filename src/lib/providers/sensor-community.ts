import type { WidgetPayload } from "@/types/widget";
import { fetchJson, ProviderHttpError } from "@/lib/server/http";
import { DEFAULT_PLACE, placeKey, type Place } from "@/lib/location";

type Reading = {
  timestamp: string;
  sensordatavalues: Array<{ value_type: string; value: string }>;
};

export const sensorCommunitySource: WidgetPayload["source"] = {
  provider: "Sensor.Community",
  docsUrl: "https://github.com/opendata-stuttgart/meta/wiki/EN-APIs",
  endpointTemplate: "GET /airrohr/v1/filter/area={lat},{lon},50&type=SDS011",
  attribution: "Sensor.Community 시민 센서 네트워크 (ODbL)",
};

/** 내 위치 반경 50km 안의 SDS011 센서 PM2.5 평균. */
export async function fetchSensorCommunity(place: Place = DEFAULT_PLACE): Promise<WidgetPayload> {
  const readings = await fetchJson<Reading[]>(
    `https://data.sensor.community/airrohr/v1/filter/area=${place.lat},${place.lon},50&type=SDS011`,
  );
  if (!Array.isArray(readings)) {
    throw new ProviderHttpError("Sensor.Community 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  const values = readings
    .map((reading) => Number(reading.sensordatavalues?.find((item) => item.value_type === "P2")?.value))
    .filter((value) => Number.isFinite(value) && value >= 0 && value < 1000);
  const base = {
    status: "ok" as const,
    source: sensorCommunitySource,
    fetchedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    cacheAgeMs: 0,
  };
  if (values.length === 0) {
    return {
      ...base,
      value: { headline: "주변 센서 없음", subline: `${place.name} 반경 50km 내 활성 PM2.5 센서가 없습니다.` },
    };
  }
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const latest = readings.map((reading) => reading.timestamp).sort().at(-1);
  return {
    ...base,
    value: {
      headline: `PM2.5 ${average.toFixed(1)} μg/m³`,
      subline: `${place.name} 반경 50km · 센서 ${values.length}대 평균`,
      metric: { key: `sensor-community-pm25@${placeKey(place)}`, label: `${place.name} 시민 센서 PM2.5`, value: Number(average.toFixed(2)), unit: "μg/m³" },
      details: [{ label: "센서 수", value: `${values.length}대` }],
    },
    sourceTimestamp: latest ? `${latest.replace(" ", "T")}Z` : undefined,
  };
}
