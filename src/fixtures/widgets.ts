import type { WidgetPayload } from "@/types/widget";

export type StateFixture = { id: string; name: string; icon: string; data: WidgetPayload };

/**
 * 카드가 가질 수 있는 5가지 상태 예시(점검·오래된 데이터·정상·호출 제한·실패).
 * 시각은 기준 시각(now)에서 상대적으로 만들어, 언제 열어도 "방금 전/몇 분 전"으로 보인다.
 */
export function buildStateFixtures(now: number = Date.now()): StateFixture[] {
  const at = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  const fetchedAt = at(0);
  const next = at(5 * 60_000);

  return [
    {
      id: "airkorea-maintenance",
      name: "서울 대기질",
      icon: "≋",
      data: {
        value: { headline: "점검 중", subline: "측정소 점검 안내", details: [{ label: "예상 복구", value: "오후 3시" }] },
        status: "maintenance",
        source: { provider: "에어코리아", docsUrl: "https://www.data.go.kr/data/15073861/openapi.do", endpointTemplate: "GET /getCtprvnRltmMesureDnsty" },
        fetchedAt,
        nextRefreshAt: next,
        cacheAgeMs: 0,
        warning: "공급자가 점검 중입니다. 점검이 끝나면 자동으로 다시 불러옵니다.",
      },
    },
    {
      id: "weather-stale",
      name: "서울 날씨",
      icon: "◔",
      data: {
        value: { headline: "14°C", subline: "구름 많음", details: [{ label: "어제 대비", value: "+2.4°C" }] },
        status: "stale",
        source: { provider: "Open-Meteo", docsUrl: "https://open-meteo.com/en/docs", endpointTemplate: "GET /v1/forecast" },
        sourceTimestamp: at(-9 * 60_000),
        fetchedAt: at(-3 * 60_000),
        nextRefreshAt: next,
        cacheAgeMs: 182_000,
        warning: "일시적 조회 실패로 마지막 성공값을 표시합니다.",
      },
    },
    {
      id: "upbit-ticker",
      name: "비트코인",
      icon: "₿",
      data: {
        value: { headline: "₩164,830,000", subline: "BTC / KRW", trend: "up", details: [{ label: "24시간", value: "+1.82%" }] },
        status: "ok",
        source: { provider: "Upbit", docsUrl: "https://docs.upbit.com/kr/reference/ticker-current", endpointTemplate: "GET /v1/ticker?markets=KRW-BTC" },
        sourceTimestamp: fetchedAt,
        fetchedAt,
        nextRefreshAt: at(20_000),
        cacheAgeMs: 0,
      },
    },
    {
      id: "exchange-rate",
      name: "원·달러 고시환율",
      icon: "₩",
      data: {
        value: { headline: "1,391.40원", subline: "USD 매매기준율", details: [{ label: "고시일", value: "오늘" }] },
        status: "rate_limited",
        source: { provider: "한국수출입은행", docsUrl: "https://www.data.go.kr/data/3068846/openapi.do", endpointTemplate: "GET /site/program/financial/exchangeJSON?authkey={REDACTED}&searchdate={YYYYMMDD}&data=AP01" },
        fetchedAt,
        nextRefreshAt: at(60 * 60_000),
        cacheAgeMs: 0,
        warning: "호출 한도에 도달했습니다. 잠시 뒤 다시 시도합니다.",
      },
    },
    {
      id: "holiday-error",
      name: "다음 공휴일",
      icon: "◆",
      data: {
        value: null,
        status: "error",
        source: { provider: "Nager.Date", docsUrl: "https://date.nager.at/Api", endpointTemplate: "GET /api/v3/NextPublicHolidays/KR" },
        fetchedAt,
        nextRefreshAt: next,
        cacheAgeMs: 0,
        lastError: { message: "네트워크 연결을 확인해 주세요.", occurredAt: fetchedAt },
      },
    },
  ];
}
