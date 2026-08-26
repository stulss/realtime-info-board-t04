import { fetchLostArkNotices, lostArkNoticesSource } from "@/lib/providers/lostark";
import { getCachedWidget } from "@/lib/server/cache";
import { widgetResponse } from "@/lib/server/widget-response";

const TTL_MS = 15 * 60_000;

export async function GET() {
  return widgetResponse(lostArkNoticesSource, () => getCachedWidget("lostark-notices", TTL_MS, fetchLostArkNotices), TTL_MS);
}
