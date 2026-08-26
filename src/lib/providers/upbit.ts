import type { WidgetPayload } from "@/types/widget";
import { fetchJson } from "@/lib/server/http";

type UpbitTicker = {
  trade_price: number;
  signed_change_rate: number;
  timestamp: number;
};

export const upbitSource: WidgetPayload["source"] = {
  provider: "Upbit",
  docsUrl: "https://docs.upbit.com/kr/reference/ticker-current",
  endpointTemplate: "GET /v1/ticker?markets=KRW-BTC",
  attribution: "Upbit Open API",
};

export async function fetchUpbitTicker(): Promise<WidgetPayload> {
  const [ticker] = await fetchJson<UpbitTicker[]>("https://api.upbit.com/v1/ticker?markets=KRW-BTC");
  if (!ticker) throw new Error("Upbit 응답에 KRW-BTC 시세가 없습니다.");
  const fetchedAt = new Date().toISOString();
  const changePercent = ticker.signed_change_rate * 100;
  return {
    value: {
      headline: new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(ticker.trade_price),
      subline: "BTC / KRW",
      trend: changePercent > 0 ? "up" : changePercent < 0 ? "down" : "flat",
      details: [{ label: "24시간", value: `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%` }],
    },
    status: "ok",
    source: upbitSource,
    sourceTimestamp: new Date(ticker.timestamp).toISOString(),
    fetchedAt,
    nextRefreshAt: new Date(Date.now() + 20_000).toISOString(),
    cacheAgeMs: 0,
  };
}
