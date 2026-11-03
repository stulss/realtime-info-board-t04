import { fetchKmaWeather, kmaSource } from "@/lib/providers/data-go-kr";
import { createPlaceRoute } from "@/lib/server/widget-route";

export const GET = createPlaceRoute("kma-weather", kmaSource, 10 * 60_000, (place) => fetchKmaWeather(place));
