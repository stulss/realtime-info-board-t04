import { fetchWeather, weatherSource } from "@/lib/providers/open-meteo";
import { createPlaceRoute } from "@/lib/server/widget-route";

export const GET = createPlaceRoute("weather", weatherSource, 10 * 60_000, fetchWeather);
