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
  /** true면 공급자가 확정한 일별 값(일봉 종가 등)으로 자동 채운 기록 */
  closed?: boolean;
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

  return commit(entries, next, now);
}

/** 항목 1건을 id 기준으로 교체하고 보관 기간을 넘긴 기록을 정리한 뒤 최신 날짜순으로 정렬한다. */
function commit(entries: DailyLogEntry[], next: DailyLogEntry, now: Date): DailyLogEntry[] {
  const cutoff = toKstDate(new Date(now.getTime() - DAILY_LOG_RETENTION_DAYS * 86_400_000));
  return [...entries.filter((entry) => entry.id !== next.id), next]
    .filter((entry) => entry.date >= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label, "ko"));
}

/** 공급자가 확정해 준 "그날의 값"(예: Upbit 일봉 종가). */
export type DailyClose = {
  metricKey: string;
  label: string;
  unit: string;
  date: string;
  value: number;
  sourceTimestamp: string;
  fetchedAt: string;
};

/**
 * 확정된 일별 값을 날짜별 기록에 자동으로 채운다(순수 함수).
 * 접속하지 않은 날도 공급자가 준 값으로 하루 한 줄이 생기고, 같은 날짜는 항상 한 건이다.
 * 이미 같은 값으로 기록돼 있으면 참조를 그대로 돌려줘 불필요한 저장을 막고,
 * 저장값이 원자료와 다르면 원자료로 바로잡는다.
 */
export function applyDailyCloses(entries: DailyLogEntry[], closes: DailyClose[], now: Date = new Date()): DailyLogEntry[] {
  let result = entries;
  for (const close of closes) {
    if (!Number.isFinite(close.value) || !/^\d{4}-\d{2}-\d{2}$/.test(close.date)) continue;
    const id = `${close.metricKey}:${close.date}`;
    const existing = result.find((entry) => entry.id === id);
    if (existing?.closed && existing.latest === close.value && existing.unit === close.unit) continue;
    result = commit(result, {
      id, metricKey: close.metricKey, label: close.label, unit: close.unit, date: close.date,
      first: close.value, latest: close.value, min: close.value, max: close.value,
      samples: 1, firstAt: close.sourceTimestamp, updatedAt: now.toISOString(), lastFetchedAt: close.fetchedAt,
      closed: true,
    }, now);
  }
  return result;
}

/** 직전 값 대비 변화를 "+3.1%"/"−0.4%" 형태로(이전이 0이면 절대 변화). */
export function formatDelta(diff: number, percent: number | null): string {
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  if (percent !== null && Math.abs(percent) >= 0.01) {
    return `${sign}${Math.abs(percent).toFixed(Math.abs(percent) < 10 ? 1 : 0)}%`;
  }
  return `${sign}${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(Math.abs(diff))}`;
}

export function groupByDate(entries: DailyLogEntry[]): Array<[string, DailyLogEntry[]]> {
  const groups = new Map<string, DailyLogEntry[]>();
  for (const entry of entries) groups.set(entry.date, [...(groups.get(entry.date) ?? []), entry]);
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

/** 한 지표의 최근 N일 기록을 오래된 날짜부터 반환한다(차트·스파크라인용). */
export function seriesFor(entries: DailyLogEntry[], metricKey: string, days = 7): DailyLogEntry[] {
  return entries
    .filter((entry) => entry.metricKey === metricKey)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days);
}

/** 기록에 있는 지표 목록(이름순, 중복 없음). */
export function listMetrics(entries: DailyLogEntry[]): Array<{ key: string; label: string; unit: string }> {
  const map = new Map<string, { key: string; label: string; unit: string }>();
  for (const entry of entries) map.set(entry.metricKey, { key: entry.metricKey, label: entry.label, unit: entry.unit });
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "ko"));
}

/** 표시용 숫자 포맷: 부동소수 노이즈(13.950000000000001)를 최대 소수 2자리로 정리한다. */
export function fmtNum(value: number): string {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
}

export type PreviousComparison = {
  previousDate: string;
  diff: number;
  /** 이전 값이 0이면 null */
  percent: number | null;
  direction: "up" | "down" | "flat";
};

/**
 * 가장 최근 기록(history 마지막)이 아닌, 그 직전 "다른 날짜" 기록과 현재값을 비교한다.
 * history는 오래된 날짜 → 최신 순서. 현재값이 오늘 기록보다 더 새로우므로 current를 따로 받는다.
 */
export function compareToPrevious(history: DailyLogEntry[], current: number): PreviousComparison | null {
  if (history.length < 2 || !Number.isFinite(current)) return null;
  const previous = history[history.length - 2];
  const diff = current - previous.latest;
  return {
    previousDate: previous.date,
    diff,
    percent: previous.latest === 0 ? null : (diff / Math.abs(previous.latest)) * 100,
    direction: diff > 0 ? "up" : diff < 0 ? "down" : "flat",
  };
}

/** 값의 위치를 0~1로 환산한다. 범위가 0이면 0.5. */
export function ratio(value: number, min: number, max: number): number {
  return max === min ? 0.5 : Math.min(1, Math.max(0, (value - min) / (max - min)));
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

export function recordDailyCloses(closes: DailyClose[]): void {
  const current = loadDailyLog();
  const next = applyDailyCloses(current, closes);
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
