import type { DailyClose } from "./daily-log";
import { HISTORY_START_DATE } from "./range";

export type HistoryFetchResult = { closes: DailyClose[]; failedSources: string[] };

type RawPoint = {
  metricKey: unknown; label: unknown; unit: unknown; date: unknown; value: unknown;
  min?: unknown; max?: unknown; sourceTimestamp: unknown;
};

function toClose(point: RawPoint, fetchedAt: string): DailyClose | undefined {
  if (typeof point.metricKey !== "string" || typeof point.label !== "string" || typeof point.unit !== "string"
    || typeof point.date !== "string" || typeof point.value !== "number" || !Number.isFinite(point.value)) return undefined;
  return {
    metricKey: point.metricKey, label: point.label, unit: point.unit, date: point.date, value: point.value,
    min: typeof point.min === "number" ? point.min : undefined,
    max: typeof point.max === "number" ? point.max : undefined,
    sourceTimestamp: typeof point.sourceTimestamp === "string" ? point.sourceTimestamp : `${point.date}T00:00:00.000Z`,
    fetchedAt,
  };
}

/** `/api/history`(시작일 ~ 어제)를 받아 날짜별 기록에 채울 값으로 바꾼다. 일부 출처가 실패해도 나머지는 쓴다. */
export async function fetchHistoryCloses(placeQuery: string): Promise<HistoryFetchResult> {
  const query = new URLSearchParams(placeQuery);
  query.set("from", HISTORY_START_DATE);
  const response = await fetch(`/api/history?${query.toString()}`, { signal: AbortSignal.timeout(45_000) });
  const body = (await response.json()) as { points?: RawPoint[]; fetchedAt?: string; sources?: Array<{ name?: string; ok?: boolean }> };
  if (!response.ok || !Array.isArray(body.points)) throw new Error("과거 기록을 가져오지 못했습니다.");
  const fetchedAt = typeof body.fetchedAt === "string" ? body.fetchedAt : new Date().toISOString();
  return {
    closes: body.points.map((point) => toClose(point, fetchedAt)).filter((close): close is DailyClose => close !== undefined),
    failedSources: (body.sources ?? []).filter((source) => source.ok === false).map((source) => String(source.name)),
  };
}
