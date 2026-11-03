import { fetchForecast, forecastSource } from "@/lib/providers/forecast-extras";
import { createPlaceRoute } from "@/lib/server/widget-route";

export const GET = createPlaceRoute("weather-forecast", forecastSource, 60 * 60_000, fetchForecast);
