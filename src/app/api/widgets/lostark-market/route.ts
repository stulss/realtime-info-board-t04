import { fetchLostArkMarket, lostArkMarketSource } from "@/lib/providers/lostark";
import { getCachedWidget } from "@/lib/server/cache";
import { widgetResponse } from "@/lib/server/widget-response";

const TTL_MS = 5 * 60_000;

export async function GET() {
  return widgetResponse(lostArkMarketSource, () => getCachedWidget("lostark-market", TTL_MS, fetchLostArkMarket), TTL_MS);
}
