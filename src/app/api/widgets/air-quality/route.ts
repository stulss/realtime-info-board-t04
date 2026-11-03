import { airQualitySource, fetchAirQuality } from "@/lib/providers/open-meteo";
import { createPlaceRoute } from "@/lib/server/widget-route";

export const GET = createPlaceRoute("air-quality", airQualitySource, 30 * 60_000, fetchAirQuality);
