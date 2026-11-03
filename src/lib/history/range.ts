/** 날짜별 기록을 미리 채우는 시작일. 이날부터 어제까지는 공급자의 과거 원자료로, 오늘부터는 실시간으로 쌓는다. */
export const HISTORY_START_DATE = "2026-08-01";

/** 브라우저 저장 용량을 지키기 위해 보관하는 최대 일수 */
export const DAILY_LOG_RETENTION_DAYS = 366;

const DAY_MS = 86_400_000;

/** 두 YYYY-MM-DD 사이의 일수(달력 기준). */
export function daysBetweenDates(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

const KST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
export function kstToday(now: Date = new Date()): string {
  return KST.format(now);
}

/** Upbit 일봉 1회 요청 최대 개수 */
export const UPBIT_MAX_CANDLES = 200;

/** 시작일부터 오늘까지 모두 덮는 일봉 개수(오늘 진행 중인 봉 포함, 상한 200). */
export function upbitDailyCount(now: Date = new Date()): number {
  return Math.min(UPBIT_MAX_CANDLES, daysBetweenDates(HISTORY_START_DATE, kstToday(now)) + 1);
}

/** 쿼리의 from 값을 검증해 [시작일, 어제] 범위로 정리한다. 형식이 틀리면 시작일 기본값. */
export function resolveRange(fromParam: string | null, now: Date = new Date()): { from: string; to: string } {
  const today = kstToday(now);
  const to = addDays(today, -1);
  let from = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) && !Number.isNaN(Date.parse(fromParam)) ? fromParam : HISTORY_START_DATE;
  const earliest = addDays(today, -DAILY_LOG_RETENTION_DAYS);
  if (from < earliest) from = earliest;
  if (from > to) from = to;
  return { from, to };
}
