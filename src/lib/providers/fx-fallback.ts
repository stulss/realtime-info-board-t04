import type { WidgetPayload } from "@/types/widget";
import { fetchJson, ProviderHttpError } from "@/lib/server/http";
import type { ExchangeCurrency } from "@/lib/widget-options";

export const fxFallbackSource: WidgetPayload["source"] = {
  provider: "Frankfurter (ECB 등 중앙은행 참조환율)",
  docsUrl: "https://frankfurter.dev",
  endpointTemplate: "GET /v2/rate/{통화}/KRW",
  attribution: "Frankfurter · 유럽중앙은행 등 공식 참조환율(하루 1회 갱신)",
};

type Rate = { date: string; base: string; quote: string; rate: number };

/** 수출입은행 통화 코드 → Frankfurter 코드와 표시 배수. 지원하지 않는 통화(중동 통화 등)는 null. */
export function toFxCode(currency: ExchangeCurrency): { code: string; multiplier: number } | null {
  const multiplier = /\((\d+)\)$/.exec(currency)?.[1];
  const raw = currency.replace(/\(\d+\)$/, "");
  const code = raw === "CNH" ? "CNY" : raw;
  const supported = new Set(["USD", "JPY", "EUR", "CNY", "GBP", "AUD", "CAD", "CHF", "HKD", "SGD", "NZD", "THB", "IDR", "MYR", "DKK", "NOK", "SEK"]);
  return supported.has(code) ? { code, multiplier: multiplier ? Number(multiplier) : 1 } : null;
}

/**
 * 수출입은행 API 키가 없을 때의 키 없는 대체 환율.
 * 한국 고시환율(매매기준율)이 아니라 국제 참조환율이므로 출처와 성격을 그대로 표시한다.
 */
export async function fetchFxFallback(currency: ExchangeCurrency): Promise<WidgetPayload> {
  const mapped = toFxCode(currency);
  if (!mapped) {
    throw new ProviderHttpError(`${currency} 환율은 수출입은행 API 키가 있어야 조회할 수 있습니다.`, 401);
  }
  const body = await fetchJson<Rate>(`https://api.frankfurter.dev/v2/rate/${mapped.code}/KRW`);
  if (!body || !Number.isFinite(body.rate) || typeof body.date !== "string") {
    throw new ProviderHttpError("Frankfurter 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  const value = Number((body.rate * mapped.multiplier).toFixed(2));
  return {
    value: {
      headline: `${new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}원`,
      subline: `${mapped.multiplier > 1 ? `${mapped.multiplier} ` : "1 "}${mapped.code} → KRW · 국제 참조환율`,
      metric: { key: `fx:${currency}`, label: `${mapped.code}/KRW 참조환율`, value, unit: "KRW" },
      details: [
        { label: "기준일", value: body.date },
        { label: "성격", value: "ECB 등 참조환율(고시환율 아님)" },
      ],
    },
    status: "ok",
    source: fxFallbackSource,
    sourceTimestamp: `${body.date}T00:00:00.000Z`,
    fetchedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    cacheAgeMs: 0,
  };
}
