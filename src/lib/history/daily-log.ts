import type { WidgetMetric } from "@/types/widget";

export const DAILY_LOG_STORAGE_KEY = "pulseboard-daily-log-v1";
export const DAILY_LOG_EVENT = "pulseboard-daily-log-changed";
export const DAILY_LOG_TIMEZONE = "Asia/Seoul" as const;
/** 브라우저 저장 용량을 지키기 위해 보관하는 최대 일수 */
export const DAILY_LOG_RETENTION_DAYS = 90;

export type DailyLogEntry = {
  /** `${metricKey}:${date}` — 같은 지표·같은 날짜는 항상 한 건 */
  id: string;
  metricKey: string;
  label: string;
  unit: string;
  date: string;
  first: number;
  latest: number;
  min: number;
  max: number;
  samples: number;
  firstAt: string;
  updatedAt: string;
  lastFetchedAt: string;
};

const KST_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: DAILY_LOG_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toKstDate(value: string | Date): string {
  return KST_DATE.format(typeof value === "string" ? new Date(value) : value);
}

function isEntry(value: unknown): value is DailyLogEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Partial<DailyLogEntry>;
  return typeof e.id === "string" && typeof e.metricKey === "string" && typeof e.label === "string"
    && typeof e.unit === "string" && typeof e.date === "string"
    && [e.first, e.latest, e.min, e.max, e.samples].every((n) => typeof n === "number" && Number.isFinite(n))
    && typeof e.firstAt === "string" && typeof e.updatedAt === "string" && typeof e.lastFetchedAt === "string";
}

export function parseDailyLog(raw: string | null): DailyLogEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/**
 * 조회 결과 1건을 해당 KST 날짜의 기록에 반영한다(순수 함수).
 * - 같은 `fetchedAt`는 중복 집계하지 않는다.
 * - 같은 날짜는 한 건으로 합쳐 최신·최소·최대·표본 수를 갱신한다.
 */
export function recordMetric(
  entries: DailyLogEntry[],
  metric: WidgetMetric,
  fetchedAt: string,
  now: Date = new Date(),
): DailyLogEntry[] {
  if (!Number.isFinite(metric.value) || Number.isNaN(new Date(fetchedAt).getTime())) return entries;
  const date = toKstDate(fetchedAt);
  const id = `${metric.key}:${date}`;
  const existing = entries.find((entry) => entry.id === id);
  const nowIso = now.toISOString();

  let next: DailyLogEntry;
  if (!existing) {
    next = {
      id, metricKey: metric.key, label: metric.label, unit: metric.unit, date,
      first: metric.value, latest: metric.value, min: metric.value, max: metric.value,
      samples: 1, firstAt: fetchedAt, updatedAt: nowIso, lastFetchedAt: fetchedAt,
    };
  } else if (existing.lastFetchedAt === fetchedAt) {
    return entries;
  } else {
    next = {
      ...existing,
      label: metric.label,
      unit: metric.unit,
      latest: metric.value,
      min: Math.min(existing.min, metric.value),
      max: Math.max(existing.max, metric.value),
      samples: existing.samples + 1,
      updatedAt: nowIso,
      lastFetchedAt: fetchedAt,
    };
  }

  const cutoff = toKstDate(new Date(now.getTime() - DAILY_LOG_RETENTION_DAYS * 86_400_000));
  return [...entries.filter((entry) => entry.id !== id), next]
    .filter((entry) => entry.date >= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label, "ko"));
}

export function groupByDate(entries: DailyLogEntry[]): Array<[string, DailyLogEntry[]]> {
  const groups = new Map<string, DailyLogEntry[]>();
  for (const entry of entries) groups.set(entry.date, [...(groups.get(entry.date) ?? []), entry]);
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function dailyLogToCsv(entries: DailyLogEntry[]): string {
  const header = ["날짜(KST)", "지표", "단위", "최신값", "최소", "최대", "첫 값", "표본 수", "마지막 갱신"];
  const rows = entries.map((e) => [e.date, e.label, e.unit, e.latest, e.min, e.max, e.first, e.samples, e.updatedAt]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

/* ---------- 브라우저 저장소 래퍼 ---------- */

export function loadDailyLog(): DailyLogEntry[] {
  try {
    return parseDailyLog(window.localStorage.getItem(DAILY_LOG_STORAGE_KEY));
  } catch {
    return [];
  }
}

function saveDailyLog(entries: DailyLogEntry[]): void {
  try {
    window.localStorage.setItem(DAILY_LOG_STORAGE_KEY, JSON.stringify(entries));
    window.dispatchEvent(new Event(DAILY_LOG_EVENT));
  } catch {
    // 저장소가 막힌 환경(시크릿 모드 등)에서는 화면 표시만 유지한다.
  }
}

export function recordWidgetMetric(metric: WidgetMetric, fetchedAt: string): void {
  const current = loadDailyLog();
  const next = recordMetric(current, metric, fetchedAt);
  if (next !== current) saveDailyLog(next);
}

export function clearDailyLog(): void {
  try {
    window.localStorage.removeItem(DAILY_LOG_STORAGE_KEY);
    window.dispatchEvent(new Event(DAILY_LOG_EVENT));
  } catch {
    // 무시
  }
}
