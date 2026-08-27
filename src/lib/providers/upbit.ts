import type { WidgetPayload } from "@/types/widget";
import { fetchJson, ProviderHttpError } from "@/lib/server/http";
import {
  DAILY_RECORD_TIMEZONE,
  type DailyHistoryResponse,
} from "@/lib/history/daily-records";

type UpbitTicker = {
  trade_price: number;
  signed_change_rate: number;
  timestamp: number;
};

type UpbitDailyCandle = {
  market: string;
  candle_date_time_utc: string;
  candle_date_time_kst: string;
  trade_price: number;
  timestamp: number;
};

const UPBIT_DAILY_URL = "https://api.upbit.com/v1/candles/days?market=KRW-BTC&count=3";

export const upbitSource: WidgetPayload["source"] = {
  provider: "Upbit",
  docsUrl: "https://docs.upbit.com/kr/reference/ticker-current",
  endpointTemplate: "GET /v1/ticker?markets=KRW-BTC",
  attribution: "Upbit Open API",
};

export async function fetchUpbitTicker(): Promise<WidgetPayload> {
  const [ticker] = await fetchJson<UpbitTicker[]>("https://api.upbit.com/v1/ticker?markets=KRW-BTC");
  if (!ticker || !Number.isFinite(ticker.trade_price) || !Number.isFinite(ticker.signed_change_rate) || !Number.isFinite(ticker.timestamp)) {
    throw new ProviderHttpError("Upbit 티커 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
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

export async function fetchUpbitDailyHistory(): Promise<DailyHistoryResponse> {
  const candles = await fetchJson<UpbitDailyCandle[]>(UPBIT_DAILY_URL, { retries: 1 });
  if (!Array.isArray(candles)) {
    throw new ProviderHttpError("Upbit 일봉 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: DAILY_RECORD_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const completed = candles.filter((candle) => candle.candle_date_time_kst?.slice(0, 10) < today).slice(0, 2);
  if (completed.length < 2) throw new ProviderHttpError("Upbit 완료 일봉 2건이 없습니다.", 503);
  const fetchedAt = new Date().toISOString();
  const records = completed.map((candle) => {
    if (!Number.isFinite(candle.trade_price) || !candle.candle_date_time_kst) {
      throw new ProviderHttpError("Upbit 일봉 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
    }
    const date = candle.candle_date_time_kst.slice(0, 10);
    return {
      id: `upbit:${candle.market}:${date}`,
      metric: "KRW-BTC 일봉 종가",
      date,
      timezone: DAILY_RECORD_TIMEZONE,
      value: candle.trade_price,
      unit: "KRW",
      sourceTimestamp: `${candle.candle_date_time_kst}+09:00`,
      fetchedAt,
      storedAt: fetchedAt,
    };
  });

  return {
    metric: "KRW-BTC 일봉 종가",
    timezone: DAILY_RECORD_TIMEZONE,
    source: {
      provider: "Upbit Open API",
      url: UPBIT_DAILY_URL,
      endpointTemplate: "GET /v1/candles/days?market=KRW-BTC&count=3",
    },
    fetchedAt,
    records,
  };
}
