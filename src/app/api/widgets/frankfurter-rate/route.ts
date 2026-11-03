import { fetchFrankfurterUsdKrw, frankfurterSource } from "@/lib/providers/frankfurter";
import { createWidgetRoute } from "@/lib/server/widget-route";

export const GET = createWidgetRoute("frankfurter-rate", frankfurterSource, 60 * 60_000, fetchFrankfurterUsdKrw);
