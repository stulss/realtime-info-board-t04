import { eximSource, fetchExchangeRate } from "@/lib/providers/exim";
import { getCachedWidget } from "@/lib/server/cache";
import { DEFAULT_EXCHANGE_CURRENCY, isExchangeCurrency } from "@/lib/widget-options";
import { widgetResponse } from "@/lib/server/widget-response";
import { ProviderHttpError } from "@/lib/server/http";

// 일환율은 영업일 11시 전후 갱신되므로 시간 단위 재검증으로 당일 고시를 반영한다.
// 최대 24회/일로 공급자의 1,000회/일 제한보다 충분히 낮다.
const TTL_MS = 60 * 60_000;

export async function GET(request: Request) {
  const requestedCurrency = new URL(request.url).searchParams.get("currency")?.trim().toUpperCase()
    ?? DEFAULT_EXCHANGE_CURRENCY;

  return widgetResponse(eximSource, () => {
    if (!isExchangeCurrency(requestedCurrency)) {
      throw new ProviderHttpError("지원하지 않는 통화 코드입니다.", 400);
    }
    return getCachedWidget(
      `exchange-rate:${requestedCurrency}`,
      TTL_MS,
      () => fetchExchangeRate(requestedCurrency),
    );
  }, TTL_MS);
}
