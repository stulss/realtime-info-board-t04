export const DAILY_RECORD_STORAGE_KEY = "pulseboard-daily-records-v1";
export const DAILY_RECORD_TIMEZONE = "Asia/Seoul" as const;

export type DailyRecord = {
  id: string;
  metric: string;
  date: string;
  timezone: typeof DAILY_RECORD_TIMEZONE;
  value: number;
  unit: string;
  sourceTimestamp: string;
  fetchedAt: string;
  storedAt: string;
};

export type DailyHistoryResponse = {
  metric: string;
  timezone: typeof DAILY_RECORD_TIMEZONE;
  source: {
    provider: string;
    url: string;
    endpointTemplate: string;
  };
  fetchedAt: string;
  records: DailyRecord[];
};

export type DailyComparison = {
  currentDate: string;
  previousDate: string;
  currentValue: number;
  previousValue: number;
  difference: number;
  direction: "증가" | "감소" | "변화 없음";
  unit: string;
  percentage: number | null;
};

function isDailyRecord(value: unknown): value is DailyRecord {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<DailyRecord>;
  return typeof item.id === "string"
    && typeof item.metric === "string"
    && typeof item.date === "string"
    && item.timezone === DAILY_RECORD_TIMEZONE
    && typeof item.value === "number"
    && Number.isFinite(item.value)
    && typeof item.unit === "string"
    && typeof item.sourceTimestamp === "string"
    && typeof item.fetchedAt === "string"
    && typeof item.storedAt === "string";
}

export function isDailyHistoryResponse(value: unknown): value is DailyHistoryResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Partial<DailyHistoryResponse>;
  return typeof response.metric === "string"
    && response.timezone === DAILY_RECORD_TIMEZONE
    && typeof response.fetchedAt === "string"
    && typeof response.source === "object"
    && response.source !== null
    && typeof response.source.provider === "string"
    && typeof response.source.url === "string"
    && typeof response.source.endpointTemplate === "string"
    && Array.isArray(response.records)
    && response.records.every(isDailyRecord);
}

export function parseDailyRecords(raw: string | null): DailyRecord[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isDailyRecord) : [];
  } catch {
    return [];
  }
}

export function mergeDailyRecords(
  existing: DailyRecord[],
  incoming: DailyRecord[],
): DailyRecord[] {
  const byId = new Map(existing.map((record) => [record.id, record]));
  for (const record of incoming) byId.set(record.id, record);
  return [...byId.values()].sort((left, right) => right.date.localeCompare(left.date));
}

export function calculateDailyComparison(records: DailyRecord[]): DailyComparison | null {
  const [current, previous] = mergeDailyRecords([], records);
  if (!current || !previous || current.date === previous.date || current.unit !== previous.unit) return null;
  const difference = current.value - previous.value;
  return {
    currentDate: current.date,
    previousDate: previous.date,
    currentValue: current.value,
    previousValue: previous.value,
    difference,
    direction: difference > 0 ? "증가" : difference < 0 ? "감소" : "변화 없음",
    unit: current.unit,
    percentage: previous.value === 0 ? null : (difference / previous.value) * 100,
  };
}
