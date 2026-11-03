import { fetchSeoulWeather, weatherSource } from "@/lib/providers/open-meteo";
import { createWidgetRoute } from "@/lib/server/widget-route";

export const GET = createWidgetRoute("weather", weatherSource, 10 * 60_000, fetchSeoulWeather);
