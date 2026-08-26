import { fetchLostArkMarket, lostArkMarketSource } from "@/lib/providers/lostark";
import { getCachedWidget } from "@/lib/server/cache";
import { isValidMarketItemName, normalizeMarketItemName } from "@/lib/widget-options";
import { widgetResponse } from "@/lib/server/widget-response";
import { ProviderHttpError } from "@/lib/server/http";

const TTL_MS = 5 * 60_000;

export async function GET(request: Request) {
  const itemName = normalizeMarketItemName(new URL(request.url).searchParams.get("itemName"));

  return widgetResponse(lostArkMarketSource, () => {
    if (!isValidMarketItemName(itemName)) {
      throw new ProviderHttpError("검색어는 50자 이하의 한글·영문·숫자와 기본 기호만 사용할 수 있습니다.", 400);
    }
    return getCachedWidget(
      `lostark-market:${itemName.toLocaleLowerCase("ko-KR")}`,
      TTL_MS,
      () => fetchLostArkMarket(itemName),
    );
  }, TTL_MS);
}
