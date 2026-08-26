import type { WidgetPayload } from "@/types/widget";
import { fetchJson, ProviderHttpError } from "@/lib/server/http";

type EximRate = {
  result: number;
  cur_unit?: string;
  cur_nm?: string;
  deal_bas_r?: string;
};

const EXIM_API_URL = "https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON";
const REFRESH_INTERVAL_MS = 60 * 60_000;

export const eximSource: WidgetPayload["source"] = {
  provider: "한국수출입은행",
  docsUrl: "https://www.data.go.kr/data/3068846/openapi.do",
  endpointTemplate: "GET https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey={REDACTED}&searchdate={YYYYMMDD}&data=AP01",
  attribution: "한국수출입은행 환율정보",
};

function searchDate(daysAgo = 0): string {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(date)
    .replaceAll("-", "");
}

export async function fetchExchangeRate(): Promise<WidgetPayload> {
  const apiKey = process.env.EXIM_SERVICE_KEY;
  if (!apiKey) throw new ProviderHttpError("EXIM_SERVICE_KEY 환경변수 설정이 필요합니다.", 500);

  let matched: EximRate | undefined;
  let publishedDate = searchDate();
  for (let daysAgo = 0; daysAgo < 7 && !matched; daysAgo += 1) {
    publishedDate = searchDate(daysAgo);
    const url = new URL(EXIM_API_URL);
    url.searchParams.set("authkey", apiKey);
    url.searchParams.set("searchdate", publishedDate);
    url.searchParams.set("data", "AP01");
    const rates = await fetchJson<EximRate[] | null>(url.toString(), { retries: 1 });
    const resultCode = rates?.[0]?.result;

    if (resultCode === 2) {
      throw new ProviderHttpError("한국수출입은행 API 요청 유형(data)이 올바르지 않습니다.", 400);
    }
    if (resultCode === 3) {
      throw new ProviderHttpError("한국수출입은행 인증키가 유효하지 않거나 보유기간 만료로 파기되었습니다.", 401);
    }
    if (resultCode === 4) {
      throw new ProviderHttpError("한국수출입은행 API 일일 호출 한도(1,000회)에 도달했습니다.", 429, REFRESH_INTERVAL_MS);
    }

    matched = rates?.find((rate) =>
      rate.result === 1
      && rate.cur_unit === (process.env.EXIM_CURRENCY ?? "USD")
      && typeof rate.deal_bas_r === "string",
    );
  }

  if (!matched) throw new ProviderHttpError("최근 7일 이내 고시 환율을 찾지 못했습니다.", 404);
  const fetchedAt = new Date().toISOString();
  return {
    value: {
      headline: `${matched.deal_bas_r}원`,
      subline: `${matched.cur_unit} 매매기준율`,
      details: [{ label: "고시일", value: publishedDate }],
    },
    status: "ok",
    source: eximSource,
    fetchedAt,
    nextRefreshAt: new Date(Date.now() + REFRESH_INTERVAL_MS).toISOString(),
    cacheAgeMs: 0,
  };
}
