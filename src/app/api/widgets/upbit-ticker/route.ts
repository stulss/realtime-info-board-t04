import { fetchUpbitTicker, upbitSource } from "@/lib/providers/upbit";
import { getCachedWidget } from "@/lib/server/cache";
import { widgetResponse } from "@/lib/server/widget-response";

const TTL_MS = 20_000;

export async function GET() {
  return widgetResponse(upbitSource, () => getCachedWidget("upbit-ticker", TTL_MS, fetchUpbitTicker), TTL_MS);
}
