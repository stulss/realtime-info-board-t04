import { eximSource, fetchExchangeRate } from "@/lib/providers/exim";
import { fetchFxFallback, fxFallbackSource } from "@/lib/providers/fx-fallback";
import { getCachedWidget } from "@/lib/server/cache";
import { DEFAULT_EXCHANGE_CURRENCY, isExchangeCurrency } from "@/lib/widget-options";
import { widgetResponse } from "@/lib/server/widget-response";
import { ProviderHttpError } from "@/lib/server/http";

// 일환율은 영업일 11시 전후 갱신되므로 시간 단위 재검증으로 당일 고시를 반영한다.
// 최대 24회/일로 공급자의 1,000회/일 제한보다 충분히 낮다.
const TTL_MS = 60 * 60_000;

/**
 * 수출입은행 키(EXIM_SERVICE_KEY)가 있으면 한국 고시환율(매매기준율)을,
 * 없으면 키 없는 국제 참조환율(Frankfurter)로 대체해 항상 동작하게 한다. 출처는 응답에 그대로 표시된다.
 */
export async function GET(request: Request) {
  const requestedCurrency = new URL(request.url).searchParams.get("currency")?.trim().toUpperCase()
    ?? DEFAULT_EXCHANGE_CURRENCY;
  const useExim = Boolean(process.env.EXIM_SERVICE_KEY?.trim());

  return widgetResponse(useExim ? eximSource : fxFallbackSource, () => {
    if (!isExchangeCurrency(requestedCurrency)) {
      throw new ProviderHttpError("지원하지 않는 통화 코드입니다.", 400);
    }
    return getCachedWidget(
      `exchange-rate:${useExim ? "exim" : "fx"}:${requestedCurrency}`,
      TTL_MS,
      () => (useExim ? fetchExchangeRate(requestedCurrency) : fetchFxFallback(requestedCurrency)),
    );
  }, TTL_MS);
}
