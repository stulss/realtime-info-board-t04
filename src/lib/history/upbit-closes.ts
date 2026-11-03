import { isDailyHistoryResponse } from "./daily-records";
import type { DailyClose } from "./daily-log";

export const UPBIT_CLOSE_METRIC_KEY = "upbit-btc-krw-close";
export const UPBIT_CLOSE_LABEL = "Upbit BTC/KRW 일봉 종가";
export const UPBIT_CLOSE_SOURCE_URL = "https://api.upbit.com/v1/candles/days?market=KRW-BTC&count=91";

/** 자체 API에서 Upbit 완료 일봉을 받아 "하루 한 줄" 기록으로 바꾼다. */
export async function fetchUpbitCloses(): Promise<DailyClose[]> {
  const response = await fetch("/api/widgets/upbit-daily-history", { signal: AbortSignal.timeout(10_000) });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error("일봉 기록을 가져오지 못했습니다.");
  if (!isDailyHistoryResponse(body)) throw new Error("일봉 기록 응답 형식이 변경되었습니다.");
  return body.records.map((record) => ({
    metricKey: UPBIT_CLOSE_METRIC_KEY,
    label: UPBIT_CLOSE_LABEL,
    unit: record.unit,
    date: record.date,
    value: record.value,
    sourceTimestamp: record.sourceTimestamp,
    fetchedAt: body.fetchedAt,
  }));
}
