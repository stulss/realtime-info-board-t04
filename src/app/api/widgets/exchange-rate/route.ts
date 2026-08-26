import { eximSource, fetchExchangeRate } from "@/lib/providers/exim";
import { getCachedWidget } from "@/lib/server/cache";
import { widgetResponse } from "@/lib/server/widget-response";

// 일환율은 영업일 11시 전후 갱신되므로 시간 단위 재검증으로 당일 고시를 반영한다.
// 최대 24회/일로 공급자의 1,000회/일 제한보다 충분히 낮다.
const TTL_MS = 60 * 60_000;

export async function GET() {
  return widgetResponse(eximSource, () => getCachedWidget("exchange-rate", TTL_MS, fetchExchangeRate), TTL_MS);
}
