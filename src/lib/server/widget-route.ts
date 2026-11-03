import type { WidgetPayload } from "@/types/widget";
import { parsePlace, type Place } from "@/lib/location";
import { getCachedWidget } from "./cache";
import { widgetResponse } from "./widget-response";

/** 단순 위젯(파라미터 없음) Route Handler를 한 줄로 만든다. */
export function createWidgetRoute(
  key: string,
  source: WidgetPayload["source"],
  ttlMs: number,
  loader: () => Promise<WidgetPayload>,
) {
  return function GET() {
    return widgetResponse(source, () => getCachedWidget(key, ttlMs, loader), ttlMs);
  };
}

/** 위치(lat, lon, place, sido)를 쿼리로 받는 위젯 Route Handler. 위치별로 캐시를 분리한다. */
export function createPlaceRoute(
  keyPrefix: string,
  source: WidgetPayload["source"],
  ttlMs: number,
  loader: (place: Place) => Promise<WidgetPayload>,
) {
  return function GET(request: Request) {
    return widgetResponse(source, () => {
      const place = parsePlace(new URL(request.url).searchParams);
      const key = `${keyPrefix}:${place.lat},${place.lon}:${place.name}:${place.sido ?? ""}`;
      return getCachedWidget(key, ttlMs, () => loader(place));
    }, ttlMs);
  };
}
