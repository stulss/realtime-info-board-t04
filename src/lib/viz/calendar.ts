import type { DailyLogEntry } from "@/lib/history/daily-log";
import { addDays } from "@/lib/history/range";

export type CalendarDay = {
  date: string;
  /** 0 = 일요일 … 6 = 토요일 */
  weekday: number;
  entry?: DailyLogEntry;
  /** 지표 값 범위를 0~1로 정규화(기록이 없으면 undefined) */
  norm?: number;
};

export type CalendarWeek = { start: string; days: Array<CalendarDay | null> };

export type Calendar = {
  weeks: CalendarWeek[];
  /** 월 라벨이 놓일 주 인덱스 */
  months: Array<{ week: number; label: string }>;
  lo: number;
  hi: number;
  covered: number;
  total: number;
};

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/**
 * 한 지표의 날짜별 기록을 GitHub 기여 그래프식 달력(주 × 요일)으로 배치한다(순수 함수).
 * - 첫 기록일이 속한 주의 일요일부터, 마지막 기록일이 속한 주의 토요일까지 채운다.
 * - 첫·마지막 기록일 밖 칸은 null(빈 칸), 기록이 없는 날은 entry 없음.
 */
export function buildCalendar(entries: DailyLogEntry[]): Calendar {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return { weeks: [], months: [], lo: 0, hi: 0, covered: 0, total: 0 };

  const first = sorted[0].date;
  const last = sorted[sorted.length - 1].date;
  const byDate = new Map(sorted.map((entry) => [entry.date, entry]));
  const lo = Math.min(...sorted.map((entry) => entry.latest));
  const hi = Math.max(...sorted.map((entry) => entry.latest));

  const gridStart = addDays(first, -weekdayOf(first));
  const gridEnd = addDays(last, 6 - weekdayOf(last));
  const weeks: CalendarWeek[] = [];
  const months: Calendar["months"] = [];
  let total = 0;

  for (let start = gridStart; start <= gridEnd; start = addDays(start, 7)) {
    const days: CalendarWeek["days"] = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const date = addDays(start, offset);
      if (date < first || date > last) { days.push(null); continue; }
      total += 1;
      const entry = byDate.get(date);
      days.push({ date, weekday: offset, entry, norm: entry ? (hi === lo ? 0.5 : (entry.latest - lo) / (hi - lo)) : undefined });
    }
    const firstReal = days.find((day): day is CalendarDay => day !== null);
    const monthStarts = days.find((day) => day !== null && day.date.endsWith("-01"));
    if (monthStarts || (weeks.length === 0 && firstReal)) {
      const reference = (monthStarts ?? firstReal)!.date;
      months.push({ week: weeks.length, label: `${Number(reference.slice(5, 7))}월` });
    }
    weeks.push({ start, days });
  }
  return { weeks, months, lo, hi, covered: sorted.length, total };
}
