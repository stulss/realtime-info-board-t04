import { airKoreaSource, fetchAirKorea } from "@/lib/providers/data-go-kr";
import { createWidgetRoute } from "@/lib/server/widget-route";

export const GET = createWidgetRoute("airkorea", airKoreaSource, 30 * 60_000, () => fetchAirKorea());
