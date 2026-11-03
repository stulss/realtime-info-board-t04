import { coingeckoSource, fetchCoingeckoPrices } from "@/lib/providers/coingecko";
import { createWidgetRoute } from "@/lib/server/widget-route";

// 무료 한도(분당 수십 회)보다 충분히 낮은 2분 TTL
export const GET = createWidgetRoute("coingecko", coingeckoSource, 2 * 60_000, fetchCoingeckoPrices);
