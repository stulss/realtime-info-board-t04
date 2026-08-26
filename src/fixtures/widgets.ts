import type { WidgetPayload } from "@/types/widget";

const now = "2026-08-26T12:30:00.000Z";
const later = "2026-08-26T12:35:00.000Z";

export const verificationFixtures: Array<{
  id: string;
  name: string;
  icon: string;
  data: WidgetPayload;
}> = [
  {
    id: "lostark-notices",
    name: "로스트아크 공지",
    icon: "⚔",
    data: {
      value: { headline: "8월 26일 업데이트 안내", subline: "점검 공지 확인", details: [{ label: "최근 공지", value: "3건" }] },
      status: "maintenance",
      source: { provider: "Lost Ark OpenAPI", docsUrl: "https://developer-lostark.game.onstove.com/getting-started", endpointTemplate: "GET /news/notices" },
      fetchedAt: now,
      nextRefreshAt: later,
      cacheAgeMs: 0,
      warning: "점검 공지가 있습니다. OpenAPI 장애와는 별도 상태입니다.",
    },
  },
  {
    id: "lostark-market",
    name: "로스트아크 거래장",
    icon: "◇",
    data: {
      value: { headline: "1,248 골드", subline: "명예의 파편 주머니(대)", details: [{ label: "전일 대비", value: "+2.4%" }] },
      status: "stale",
      source: { provider: "Lost Ark OpenAPI", docsUrl: "https://developer-lostark.game.onstove.com/getting-started", endpointTemplate: "POST /markets/items" },
      fetchedAt: now,
      nextRefreshAt: later,
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
      sourceTimestamp: now,
      fetchedAt: now,
      nextRefreshAt: "2026-08-26T12:30:20.000Z",
      cacheAgeMs: 0,
    },
  },
  {
    id: "exchange-rate",
    name: "원·달러 고시환율",
    icon: "₩",
    data: {
      value: { headline: "1,391.40원", subline: "USD 매매기준율", details: [{ label: "고시일", value: "2026.08.26" }] },
      status: "rate_limited",
      source: { provider: "한국수출입은행", docsUrl: "https://www.data.go.kr/data/3068846/openapi.do", endpointTemplate: "GET /site/program/financial/exchangeJSON?authkey={REDACTED}&searchdate={YYYYMMDD}&data=AP01" },
      fetchedAt: now,
      nextRefreshAt: "2026-08-27T00:00:00.000Z",
      cacheAgeMs: 0,
      warning: "호출 한도에 도달했습니다. 다음 고시 시각에 다시 시도합니다.",
    },
  },
  {
    id: "status",
    name: "GitHub 서비스 상태",
    icon: "◉",
    data: {
      value: null,
      status: "error",
      source: { provider: "GitHub Status", docsUrl: "https://www.githubstatus.com/api", endpointTemplate: "GET /api/v2/summary.json" },
      fetchedAt: now,
      nextRefreshAt: later,
      cacheAgeMs: 0,
      lastError: { message: "네트워크 연결을 확인해 주세요.", occurredAt: now },
    },
  },
];
