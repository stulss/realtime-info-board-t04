import { describe, expect, it } from "vitest";
import {
  applyDailyCloses,
  dailyLogToCsv,
  formatDelta,
  groupByDate,
  listMetrics,
  parseDailyLog,
  ratio,
  recordMetric,
  seriesFor,
  toKstDate,
  type DailyLogEntry,
} from "./daily-log";

const metric = { key: "weather-seoul-temp", label: "서울 기온", value: 10, unit: "°C" };
const NOW = new Date("2026-11-03T06:30:00.000Z");

describe("날짜별 기록", () => {
  it("UTC 15시 이후는 다음 KST 날짜로 계산한다", () => {
    expect(toKstDate("2026-11-03T14:59:00.000Z")).toBe("2026-11-03");
    expect(toKstDate("2026-11-03T15:00:00.000Z")).toBe("2026-11-04");
  });

  it("같은 날짜의 여러 조회를 한 건으로 합쳐 최신·최소·최대·표본 수를 갱신한다", () => {
    let entries: DailyLogEntry[] = [];
    entries = recordMetric(entries, metric, "2026-11-03T01:00:00.000Z", NOW);
    entries = recordMetric(entries, { ...metric, value: 14 }, "2026-11-03T03:00:00.000Z", NOW);
    entries = recordMetric(entries, { ...metric, value: 7 }, "2026-11-03T05:00:00.000Z", NOW);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ date: "2026-11-03", first: 10, latest: 7, min: 7, max: 14, samples: 3 });
  });

  it("같은 fetchedAt(서버 캐시 재사용)는 중복 집계하지 않는다", () => {
    const once = recordMetric([], metric, "2026-11-03T01:00:00.000Z", NOW);
    const twice = recordMetric(once, metric, "2026-11-03T01:00:00.000Z", NOW);
    expect(twice).toBe(once);
    expect(twice[0].samples).toBe(1);
  });

  it("날짜가 다르면 별도 기록이 되고 최신 날짜가 먼저 온다", () => {
    let entries = recordMetric([], metric, "2026-11-02T01:00:00.000Z", NOW);
    entries = recordMetric(entries, metric, "2026-11-03T01:00:00.000Z", NOW);
    expect(entries.map((entry) => entry.date)).toEqual(["2026-11-03", "2026-11-02"]);
    expect(groupByDate(entries).map(([date]) => date)).toEqual(["2026-11-03", "2026-11-02"]);
  });

  it("숫자가 아닌 값과 잘못된 시각은 저장하지 않는다", () => {
    expect(recordMetric([], { ...metric, value: Number.NaN }, "2026-11-03T01:00:00.000Z", NOW)).toEqual([]);
    expect(recordMetric([], metric, "not-a-date", NOW)).toEqual([]);
  });

  it("보관 기간(366일)이 지난 기록은 정리하고 8월 1일 기록은 유지한다", () => {
    const keep = recordMetric([], metric, "2026-08-01T01:00:00.000Z", new Date("2026-08-01T02:00:00.000Z"));
    expect(recordMetric(keep, { ...metric, key: "k2" }, "2026-11-03T01:00:00.000Z", NOW)).toHaveLength(2);
    const old = recordMetric([], metric, "2025-07-01T01:00:00.000Z", new Date("2025-07-01T02:00:00.000Z"));
    expect(recordMetric(old, { ...metric, key: "other" }, "2026-11-03T01:00:00.000Z", NOW)).toHaveLength(1);
  });

  it("seriesFor는 한 지표의 최근 N일을 오래된 날짜부터 돌려준다", () => {
    let entries: DailyLogEntry[] = [];
    for (const day of ["01", "02", "03"]) {
      entries = recordMetric(entries, metric, `2026-11-${day}T01:00:00.000Z`, NOW);
    }
    entries = recordMetric(entries, { ...metric, key: "other" }, "2026-11-03T01:00:00.000Z", NOW);
    expect(seriesFor(entries, "weather-seoul-temp", 2).map((e) => e.date)).toEqual(["2026-11-02", "2026-11-03"]);
    expect(seriesFor(entries, "none")).toEqual([]);
    expect(listMetrics(entries).map((m) => m.key).sort()).toEqual(["other", "weather-seoul-temp"]);
  });

  it("확정 일별 값(일봉 종가)은 접속하지 않은 날도 하루 한 줄로 자동 기록된다", () => {
    const close = (date: string, value: number) => ({
      metricKey: "upbit-btc-krw", label: "Upbit BTC/KRW", unit: "KRW", date, value,
      sourceTimestamp: `${date}T09:00:00+09:00`, fetchedAt: "2026-11-03T01:30:00.000Z",
    });
    const filled = applyDailyCloses([], [close("2026-11-02", 158), close("2026-11-01", 150)], NOW);
    expect(filled.map((entry) => [entry.date, entry.latest, entry.closed])).toEqual([["2026-11-02", 158, true], ["2026-11-01", 150, true]]);
    expect(filled[0]).toMatchObject({ min: 158, max: 158, samples: 1 });
  });

  it("같은 값으로 다시 채우면 저장하지 않고(참조 유지), 다른 값이면 원자료로 바로잡는다", () => {
    const close = (value: number) => ({
      metricKey: "k", label: "종가", unit: "KRW", date: "2026-11-02", value,
      sourceTimestamp: "2026-11-02T09:00:00+09:00", fetchedAt: "2026-11-03T01:30:00.000Z",
    });
    const once = applyDailyCloses([], [close(100)], NOW);
    expect(applyDailyCloses(once, [close(100)], NOW)).toBe(once);
    const fixed = applyDailyCloses(once, [close(105)], NOW);
    expect(fixed).toHaveLength(1);
    expect(fixed[0].latest).toBe(105);
  });

  it("일별 값 채우기는 잘못된 날짜·숫자를 무시하고 라이브 기록과 같은 날짜에 공존한다", () => {
    const live = recordMetric([], { key: "live", label: "라이브", unit: "KRW", value: 1 }, "2026-11-02T01:00:00.000Z", NOW);
    const bad = { metricKey: "k", label: "종가", unit: "KRW", sourceTimestamp: "", fetchedAt: "" };
    const result = applyDailyCloses(live, [{ ...bad, date: "11/02", value: 5 }, { ...bad, date: "2026-11-02", value: Number.NaN }, { ...bad, date: "2026-11-02", value: 7 }], NOW);
    expect(result.map((entry) => entry.metricKey).sort()).toEqual(["k", "live"]);
  });

  it("수천 건을 한 번에 채워도 빠르다(O(n log n))", () => {
    const closes = Array.from({ length: 3000 }, (_, index) => ({
      metricKey: `m${index % 8}`, label: `지표${index % 8}`, unit: "u",
      date: new Date(Date.UTC(2026, 7, 1) + Math.floor(index / 8) * 86_400_000).toISOString().slice(0, 10),
      value: index, sourceTimestamp: "x", fetchedAt: "y",
    }));
    const started = performance.now();
    const filled = applyDailyCloses([], closes, NOW);
    expect(performance.now() - started).toBeLessThan(250);
    expect(filled).toHaveLength(3000);
    expect(new Set(filled.map((entry) => entry.id)).size).toBe(3000);
    expect(filled[0].date >= filled[filled.length - 1].date).toBe(true);
  });

  it("formatDelta는 부호·퍼센트·절대값 대체를 처리한다", () => {
    expect(formatDelta(2, 1.26)).toBe("+1.3%");
    expect(formatDelta(-5, -12.4)).toBe("−12%");
    expect(formatDelta(3, null)).toBe("+3");
    expect(formatDelta(0, 0)).toBe("0");
  });

  it("ratio는 0~1로 제한하고 범위가 0이면 0.5", () => {
    expect(ratio(5, 0, 10)).toBe(0.5);
    expect(ratio(-3, 0, 10)).toBe(0);
    expect(ratio(99, 0, 10)).toBe(1);
    expect(ratio(4, 4, 4)).toBe(0.5);
  });

  it("손상된 저장 문자열은 빈 배열로 복구한다", () => {
    expect(parseDailyLog("{broken")).toEqual([]);
    expect(parseDailyLog(JSON.stringify([{ id: 1 }]))).toEqual([]);
    expect(parseDailyLog(null)).toEqual([]);
  });

  it("CSV 내보내기는 쉼표가 있는 지표명을 따옴표로 감싼다", () => {
    const entries = recordMetric([], { ...metric, label: "A, B" }, "2026-11-03T01:00:00.000Z", NOW);
    const csv = dailyLogToCsv(entries);
    expect(csv.split("\n")[0]).toContain("날짜(KST)");
    expect(csv).toContain('"A, B"');
  });
});
