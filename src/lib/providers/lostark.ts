import type { WidgetPayload } from "@/types/widget";
import { fetchJson, ProviderHttpError } from "@/lib/server/http";
import { DEFAULT_MARKET_ITEM_NAME } from "@/lib/widget-options";

const LOSTARK_BASE_URL = "https://developer-lostark.game.onstove.com";
const MARKET_OPTIONS_TTL_MS = 24 * 60 * 60_000;

type LostArkNotice = { Title: string; Date: string; Type: string; Link: string };
type MarketCategory = { Code: number; CodeName: string; Subs?: MarketCategory[] };
type MarketOptions = { Categories?: MarketCategory[] };
type MarketItem = { Name: string; CurrentMinPrice: number; RecentPrice: number; YDayAvgPrice: number };
type MarketResponse = { Items?: MarketItem[]; TotalCount: number };

let marketOptionsCache: { value: MarketOptions; expiresAt: number } | undefined;
let marketOptionsRequest: Promise<MarketOptions> | undefined;

export const lostArkNoticesSource: WidgetPayload["source"] = {
  provider: "Lost Ark OpenAPI",
  docsUrl: "https://developer-lostark.game.onstove.com/getting-started",
  endpointTemplate: "GET /news/notices",
};

export const lostArkMarketSource: WidgetPayload["source"] = {
  provider: "Lost Ark OpenAPI",
  docsUrl: "https://developer-lostark.game.onstove.com/getting-started",
  endpointTemplate: "GET /markets/options → POST /markets/items",
};

function authorizationHeader(): string {
  const rawToken = process.env.LOSTARK_API_KEY?.trim();
  if (!rawToken) throw new ProviderHttpError("LOSTARK_API_KEY 환경변수 설정이 필요합니다.", 500);
  return `bearer ${rawToken.replace(/^bearer\s+/i, "")}`;
}

function lostArkHeaders(): HeadersInit {
  return { Authorization: authorizationHeader(), "Content-Type": "application/json", Accept: "application/json" };
}

async function getMarketOptions(): Promise<MarketOptions> {
  if (marketOptionsCache && marketOptionsCache.expiresAt > Date.now()) return marketOptionsCache.value;
  if (marketOptionsRequest) return marketOptionsRequest;

  marketOptionsRequest = fetchJson<MarketOptions>(`${LOSTARK_BASE_URL}/markets/options`, { headers: lostArkHeaders(), retries: 1 })
    .then((value) => {
      marketOptionsCache = { value, expiresAt: Date.now() + MARKET_OPTIONS_TTL_MS };
      return value;
    })
    .finally(() => {
      marketOptionsRequest = undefined;
    });
  return marketOptionsRequest;
}

export async function fetchLostArkNotices(): Promise<WidgetPayload> {
  const notices = await fetchJson<LostArkNotice[]>(`${LOSTARK_BASE_URL}/news/notices`, { headers: lostArkHeaders(), retries: 1 });
  const latest = notices[0];
  if (!latest) throw new ProviderHttpError("최근 로스트아크 공지가 없습니다.", 404);
  const maintenanceCount = notices.filter((notice) => /점검|maintenance/i.test(`${notice.Title} ${notice.Type}`)).length;
  const fetchedAt = new Date().toISOString();
  return {
    value: {
      headline: latest.Title,
      subline: maintenanceCount > 0 ? "점검 공지 확인" : latest.Type,
      details: [
        { label: "최근 공지", value: `${notices.length}건` },
        { label: "점검 공지", value: `${maintenanceCount}건` },
      ],
    },
    status: "ok",
    source: lostArkNoticesSource,
    fetchedAt,
    nextRefreshAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    cacheAgeMs: 0,
    warning: maintenanceCount > 0 ? "점검 공지가 있습니다. OpenAPI 접근 불가 상태와는 별도입니다." : undefined,
  };
}

function marketCategoryCodes(options: MarketOptions): number[] {
  const codes = options.Categories
    ?.map(({ Code }) => Code)
    .filter((code) => Number.isInteger(code) && code > 0) ?? [];
  return [...new Set([50000, ...codes])];
}

async function searchMarketCategory(categoryCode: number, itemName: string): Promise<MarketResponse> {
  return fetchJson<MarketResponse>(`${LOSTARK_BASE_URL}/markets/items`, {
    method: "POST",
    headers: lostArkHeaders(),
    body: JSON.stringify({
      Sort: "CURRENT_MIN_PRICE",
      CategoryCode: categoryCode,
      ItemTier: null,
      ItemGrade: null,
      ItemName: itemName,
      CharacterClass: null,
      PageNo: 1,
      SortCondition: "ASC",
    }),
    retries: 1,
  });
}

export async function fetchLostArkMarket(itemName = DEFAULT_MARKET_ITEM_NAME): Promise<WidgetPayload> {
  const options = await getMarketOptions();
  if (!options || typeof options !== "object") throw new ProviderHttpError("거래장 옵션 응답이 올바르지 않습니다.", 502);

  let item: MarketItem | undefined;
  for (const categoryCode of marketCategoryCodes(options)) {
    const response = await searchMarketCategory(categoryCode, itemName);
    item = response.Items?.find((candidate) => candidate.Name === itemName) ?? response.Items?.[0];
    if (item) break;
  }

  if (!item) throw new ProviderHttpError(`거래장에서 '${itemName}' 항목을 찾지 못했습니다.`, 404);
  const fetchedAt = new Date().toISOString();
  const change = item.YDayAvgPrice > 0 ? ((item.CurrentMinPrice - item.YDayAvgPrice) / item.YDayAvgPrice) * 100 : 0;
  return {
    value: {
      headline: `${new Intl.NumberFormat("ko-KR").format(item.CurrentMinPrice)} 골드`,
      subline: item.Name,
      trend: change > 0 ? "up" : change < 0 ? "down" : "flat",
      details: [
        { label: "최근 거래가", value: `${new Intl.NumberFormat("ko-KR").format(item.RecentPrice)} 골드` },
        { label: "전일 평균 대비", value: `${change >= 0 ? "+" : ""}${change.toFixed(1)}%` },
      ],
    },
    status: "ok",
    source: lostArkMarketSource,
    fetchedAt,
    nextRefreshAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    cacheAgeMs: 0,
  };
}
