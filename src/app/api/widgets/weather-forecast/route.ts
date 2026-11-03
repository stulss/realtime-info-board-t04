import { fetchSeoulForecast, forecastSource } from "@/lib/providers/forecast-extras";
import { createWidgetRoute } from "@/lib/server/widget-route";

export const GET = createWidgetRoute("weather-forecast", forecastSource, 60 * 60_000, () => fetchSeoulForecast());
