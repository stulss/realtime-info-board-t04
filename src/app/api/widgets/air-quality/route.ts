import { airQualitySource, fetchSeoulAirQuality } from "@/lib/providers/open-meteo";
import { createWidgetRoute } from "@/lib/server/widget-route";

export const GET = createWidgetRoute("air-quality", airQualitySource, 30 * 60_000, fetchSeoulAirQuality);
