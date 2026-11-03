import { airKoreaSource, fetchAirKorea } from "@/lib/providers/data-go-kr";
import { createPlaceRoute } from "@/lib/server/widget-route";

export const GET = createPlaceRoute("airkorea", airKoreaSource, 30 * 60_000, (place) => fetchAirKorea(place));
