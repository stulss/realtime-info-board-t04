import type { WidgetPayload } from "@/types/widget";
import { fetchJson, ProviderHttpError } from "@/lib/server/http";

type IssNow = { iss_position: { latitude: string; longitude: string }; timestamp: number };

export const issSource: WidgetPayload["source"] = {
  provider: "Open Notify",
  docsUrl: "http://open-notify.org/Open-Notify-API/ISS-Location-Now/",
  endpointTemplate: "GET /iss-now.json (서버에서만 http 호출)",
  attribution: "Open Notify",
};

export async function fetchIssPosition(): Promise<WidgetPayload> {
  const body = await fetchJson<IssNow>("http://api.open-notify.org/iss-now.json");
  const lat = Number(body?.iss_position?.latitude);
  const lon = Number(body?.iss_position?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(body.timestamp)) {
    throw new ProviderHttpError("Open Notify 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return {
    value: {
      headline: `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`,
      subline: "국제우주정거장(ISS) 현재 위치",
      facts: { lat, lon },
      details: [
        { label: "위도", value: lat.toFixed(4) },
        { label: "경도", value: lon.toFixed(4) },
      ],
    },
    status: "ok",
    source: issSource,
    sourceTimestamp: new Date(body.timestamp * 1000).toISOString(),
    fetchedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + 15_000).toISOString(),
    cacheAgeMs: 0,
  };
}
