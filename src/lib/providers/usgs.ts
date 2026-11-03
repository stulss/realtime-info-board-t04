import type { WidgetPayload } from "@/types/widget";
import { fetchJson, ProviderHttpError } from "@/lib/server/http";

type UsgsFeed = {
  metadata: { generated: number; count: number };
  features: Array<{ properties: { mag: number | null; place: string | null; time: number } }>;
};

export const usgsSource: WidgetPayload["source"] = {
  provider: "USGS Earthquake Hazards Program",
  docsUrl: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php",
  endpointTemplate: "GET /earthquakes/feed/v1.0/summary/2.5_day.geojson",
  attribution: "U.S. Geological Survey (공개 도메인)",
};

export async function fetchUsgsEarthquakes(): Promise<WidgetPayload> {
  const feed = await fetchJson<UsgsFeed>("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson");
  if (!feed?.metadata || !Array.isArray(feed.features) || !Number.isFinite(feed.metadata.generated)) {
    throw new ProviderHttpError("USGS 지진 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  const events = feed.features
    .map((feature) => feature.properties)
    .filter((item) => item && typeof item.mag === "number" && Number.isFinite(item.mag));
  const strongest = events.reduce<(typeof events)[number] | undefined>(
    (best, item) => (!best || (item.mag ?? 0) > (best.mag ?? 0) ? item : best),
    undefined,
  );
  const count = events.length;
  return {
    value: {
      headline: strongest ? `최대 M${strongest.mag!.toFixed(1)}` : "규모 2.5 이상 지진 없음",
      subline: strongest?.place ?? "최근 24시간",
      metric: { key: "usgs-quake-count", label: "전 세계 M2.5+ 지진 수(24h)", value: count, unit: "건" },
      details: [
        { label: "최근 24시간 M2.5+", value: `${count}건` },
        ...(strongest ? [{ label: "발생 시각", value: new Date(strongest.time).toISOString() }] : []),
      ],
    },
    status: "ok",
    source: usgsSource,
    sourceTimestamp: new Date(feed.metadata.generated).toISOString(),
    fetchedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    cacheAgeMs: 0,
  };
}
