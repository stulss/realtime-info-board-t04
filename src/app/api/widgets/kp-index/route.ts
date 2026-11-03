import { fetchKpIndex, kpSource } from "@/lib/providers/forecast-extras";
import { createWidgetRoute } from "@/lib/server/widget-route";

export const GET = createWidgetRoute("kp-index", kpSource, 15 * 60_000, () => fetchKpIndex());
