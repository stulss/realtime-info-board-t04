import type { WidgetPayload } from "@/types/widget";
import { fetchJson, ProviderHttpError } from "@/lib/server/http";

type Rate = { date: string; base: string; quote: string; rate: number };

export const frankfurterSource: WidgetPayload["source"] = {
  provider: "Frankfurter (ECB 등 중앙은행 참조환율)",
  docsUrl: "https://frankfurter.dev",
  endpointTemplate: "GET /v2/rate/USD/KRW",
  attribution: "Frankfurter · 유럽중앙은행 등 공식 참조환율(하루 1회 갱신)",
};

export async function fetchFrankfurterUsdKrw(): Promise<WidgetPayload> {
  const body = await fetchJson<Rate>("https://api.frankfurter.dev/v2/rate/USD/KRW");
  if (!body || !Number.isFinite(body.rate) || typeof body.date !== "string") {
    throw new ProviderHttpError("Frankfurter 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  return {
    value: {
      headline: `${new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(body.rate)}원`,
      subline: "USD → KRW 국제 참조환율",
      metric: { key: "frankfurter-usd-krw", label: "USD/KRW 참조환율", value: body.rate, unit: "KRW" },
      details: [{ label: "기준일", value: body.date }],
    },
    status: "ok",
    source: frankfurterSource,
    sourceTimestamp: `${body.date}T00:00:00.000Z`,
    fetchedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    cacheAgeMs: 0,
  };
}
