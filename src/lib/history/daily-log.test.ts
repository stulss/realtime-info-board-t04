import { describe, expect, it } from "vitest";
import {
  dailyLogToCsv,
  groupByDate,
  parseDailyLog,
  recordMetric,
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

  it("보관 기간(90일)이 지난 기록은 정리한다", () => {
    const old = recordMetric([], metric, "2026-07-01T01:00:00.000Z", new Date("2026-07-01T02:00:00.000Z"));
    expect(recordMetric(old, { ...metric, key: "other" }, "2026-11-03T01:00:00.000Z", NOW)).toHaveLength(1);
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
