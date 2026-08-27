import { describe, expect, it } from "vitest";
import {
  calculateDailyComparison,
  mergeDailyRecords,
  type DailyRecord,
} from "./daily-records";

function record(date: string, value: number, unit = "KRW"): DailyRecord {
  return {
    id: `upbit:KRW-BTC:${date}`,
    metric: "KRW-BTC 일봉 종가",
    date,
    timezone: "Asia/Seoul",
    value,
    unit,
    sourceTimestamp: `${date}T00:00:00+09:00`,
    fetchedAt: "2026-08-27T01:00:00.000Z",
    storedAt: "2026-08-27T01:00:01.000Z",
  };
}

describe("daily-records", () => {
  it("날짜와 데이터 종류가 같은 기록을 한 건으로 병합한다", () => {
    const result = mergeDailyRecords(
      [record("2026-08-26", 100)],
      [record("2026-08-26", 101), record("2026-08-27", 110)],
    );

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.date)).toEqual(["2026-08-27", "2026-08-26"]);
    expect(result[1].value).toBe(101);
  });

  it("두 실제 날짜 값의 차이·방향·단위·변화율을 계산한다", () => {
    const comparison = calculateDailyComparison([
      record("2026-08-27", 110),
      record("2026-08-26", 100),
    ]);

    expect(comparison).toMatchObject({
      currentValue: 110,
      previousValue: 100,
      difference: 10,
      direction: "증가",
      unit: "KRW",
      percentage: 10,
    });
  });

  it("기록이 부족하거나 단위가 다르면 비교값을 만들지 않는다", () => {
    expect(calculateDailyComparison([record("2026-08-27", 110)])).toBeNull();
    expect(calculateDailyComparison([
      record("2026-08-27", 110, "KRW"),
      record("2026-08-26", 100, "USD"),
    ])).toBeNull();
  });
});
