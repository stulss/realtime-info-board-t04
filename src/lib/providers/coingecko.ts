import type { WidgetPayload } from "@/types/widget";
import { fetchJson, ProviderHttpError } from "@/lib/server/http";

type Simple = Record<string, { usd: number; usd_24h_change?: number; last_updated_at?: number }>;

export const coingeckoSource: WidgetPayload["source"] = {
  provider: "CoinGecko",
  docsUrl: "https://docs.coingecko.com/reference/simple-price",
  endpointTemplate: "GET /api/v3/simple/price?ids=ethereum,bitcoin&vs_currencies=usd",
  attribution: "Powered by CoinGecko API",
};

export async function fetchCoingeckoPrices(): Promise<WidgetPayload> {
  const body = await fetchJson<Simple>(
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true",
    { retries: 1 },
  );
  const eth = body?.ethereum;
  const btc = body?.bitcoin;
  if (!eth || !btc || !Number.isFinite(eth.usd) || !Number.isFinite(btc.usd)) {
    throw new ProviderHttpError("CoinGecko 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const change = eth.usd_24h_change ?? 0;
  return {
    value: {
      headline: usd.format(eth.usd),
      subline: "ETH / USD",
      trend: change > 0 ? "up" : change < 0 ? "down" : "flat",
      metric: { key: "coingecko-eth-usd", label: "ETH/USD", value: eth.usd, unit: "USD" },
      details: [
        { label: "ETH 24시간", value: `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` },
        { label: "BTC", value: usd.format(btc.usd) },
      ],
    },
    status: "ok",
    source: coingeckoSource,
    sourceTimestamp: eth.last_updated_at ? new Date(eth.last_updated_at * 1000).toISOString() : undefined,
    fetchedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + 2 * 60_000).toISOString(),
    cacheAgeMs: 0,
  };
}
