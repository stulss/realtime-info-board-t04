import { fetchKmaWeather, kmaSource } from "@/lib/providers/data-go-kr";
import { createWidgetRoute } from "@/lib/server/widget-route";

export const GET = createWidgetRoute("kma-weather", kmaSource, 10 * 60_000, () => fetchKmaWeather());
