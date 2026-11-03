import { describe, expect, it } from "vitest";
import type { DailyLogEntry } from "@/lib/history/daily-log";
import { buildCalendar } from "./calendar";

function entry(date: string, latest: number): DailyLogEntry {
  return {
    id: `k:${date}`, metricKey: "k", label: "기온", unit: "°C", date, first: latest, latest, min: latest, max: latest, samples: 1,
    firstAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z`, lastFetchedAt: `${date}T00:00:00.000Z`,
  };
}

describe("달력 히트맵 배치", () => {
  it("기록이 없으면 빈 달력", () => {
    expect(buildCalendar([])).toMatchObject({ weeks: [], covered: 0, total: 0 });
  });

  it("2026-08-01(토)부터: 첫 주는 토요일 칸만 차고 앞 6칸은 빈 칸(null), 주는 일요일에서 시작한다", () => {
    const entries = ["01", "02", "03", "04"].map((day, index) => entry(`2026-08-${day}`, 10 + index));
    const calendar = buildCalendar(entries);
    expect(calendar.weeks).toHaveLength(2);
    expect(calendar.weeks[0].start).toBe("2026-07-26");
    expect(calendar.weeks[0].days.slice(0, 6).every((day) => day === null)).toBe(true);
    expect(calendar.weeks[0].days[6]).toMatchObject({ date: "2026-08-01", weekday: 6 });
    expect(calendar.weeks[1].days[0]).toMatchObject({ date: "2026-08-02", weekday: 0 });
    expect(calendar.weeks[1].days[1]).toMatchObject({ date: "2026-08-03" });
    expect(calendar.weeks[1].days.slice(3).every((day) => day === null)).toBe(true); // 마지막 기록일(08-04) 뒤는 빈 칸
  });

  it("기록이 없는 날은 칸은 있되 entry가 없고, 값은 지표 안에서 0~1로 정규화한다", () => {
    const calendar = buildCalendar([entry("2026-08-03", 10), entry("2026-08-05", 30)]);
    const days = calendar.weeks.flatMap((week) => week.days).filter((day) => day !== null);
    expect(days.map((day) => day!.date)).toEqual(["2026-08-03", "2026-08-04", "2026-08-05"]);
    expect(days[0]!.norm).toBe(0);
    expect(days[1]!.entry).toBeUndefined();
    expect(days[2]!.norm).toBe(1);
    expect(calendar).toMatchObject({ covered: 2, total: 3, lo: 10, hi: 30 });
  });

  it("월 라벨은 첫 주와 매월 1일이 있는 주에 붙고, 값이 모두 같으면 0.5", () => {
    const dates = Array.from({ length: 70 }, (_, index) => {
      const d = new Date(Date.UTC(2026, 7, 1 + index));
      return d.toISOString().slice(0, 10);
    });
    const calendar = buildCalendar(dates.map((date) => entry(date, 5)));
    expect(calendar.months.map((month) => month.label)).toEqual(["8월", "9월", "10월"]);
    expect(calendar.weeks.flatMap((week) => week.days).find((day) => day?.entry)!.norm).toBe(0.5);
  });
});
