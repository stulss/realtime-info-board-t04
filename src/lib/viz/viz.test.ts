import { describe, expect, it } from "vitest";
import type { DailyLogEntry } from "@/lib/history/daily-log";
import { buildBarGrid, METRIC_PALETTE } from "./bars";
import { latLonToVector, orbitPath, quakeColor, quakeHeight } from "./globe";

function entry(metricKey: string, label: string, date: string, latest: number, extra: Partial<DailyLogEntry> = {}): DailyLogEntry {
  return {
    id: `${metricKey}:${date}`, metricKey, label, unit: "u", date, first: latest, latest, min: latest - 1, max: latest + 1, samples: 1,
    firstAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z`, lastFetchedAt: `${date}T00:00:00.000Z`, ...extra,
  };
}

describe("3D 막대 격자", () => {
  it("최근 N일만 남기고 오래된 날 → 최신 순으로 인덱스를 매긴다", () => {
    const entries = ["01", "02", "03", "04", "05"].flatMap((day, index) => [entry("a", "가", `2026-08-${day}`, index), entry("b", "나", `2026-08-${day}`, index * 10)]);
    const grid = buildBarGrid(entries, { maxDates: 3 });
    expect(grid.dates).toEqual(["2026-08-03", "2026-08-04", "2026-08-05"]);
    expect(grid.cells.filter((cell) => cell.metricKey === "a").map((cell) => cell.x)).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(grid.cells).toHaveLength(6);
  });

  it("단위가 다른 지표도 지표별 0~1로 정규화하고 값이 하나뿐이면 0.5", () => {
    const entries = [
      entry("temp", "기온", "2026-08-01", 10), entry("temp", "기온", "2026-08-02", 30),
      entry("btc", "비트코인", "2026-08-01", 100_000_000), entry("btc", "비트코인", "2026-08-02", 120_000_000),
      entry("flat", "평평", "2026-08-01", 5), entry("flat", "평평", "2026-08-02", 5),
    ];
    const grid = buildBarGrid(entries);
    const norm = (key: string, date: string) => grid.cells.find((cell) => cell.metricKey === key && cell.date === date)!.norm;
    expect(norm("temp", "2026-08-01")).toBe(0);
    expect(norm("temp", "2026-08-02")).toBe(1);
    expect(norm("btc", "2026-08-02")).toBe(1);
    expect(norm("flat", "2026-08-01")).toBe(0.5);
  });

  it("기록이 하루뿐인 지표는 제외하고, 일수가 많은 순으로 최대 M개·팔레트 색을 준다", () => {
    const entries = [
      entry("once", "하루", "2026-08-01", 1),
      ...["01", "02", "03"].map((d) => entry("long", "길게", `2026-08-${d}`, 1)),
      ...["01", "02"].map((d) => entry("short", "짧게", `2026-08-${d}`, 1)),
    ];
    const grid = buildBarGrid(entries, { maxMetrics: 2 });
    expect(grid.metrics.map((metric) => metric.key)).toEqual(["long", "short"]);
    expect(grid.metrics[0].color).toBe(METRIC_PALETTE[0]);
    expect(grid.cells.some((cell) => cell.metricKey === "once")).toBe(false);
  });

  it("과거 채움 여부와 표본 수를 셀에 보존한다", () => {
    const grid = buildBarGrid([entry("a", "가", "2026-08-01", 1, { closed: true, samples: 1 }), entry("a", "가", "2026-08-02", 2, { samples: 7 })]);
    expect(grid.cells.map((cell) => [cell.closed, cell.samples])).toEqual(expect.arrayContaining([[true, 1], [false, 7]]));
  });

  it("빈 기록은 빈 격자", () => {
    expect(buildBarGrid([])).toEqual({ dates: [], metrics: [], cells: [] });
  });
});

describe("3D 지구본 수학", () => {
  it("위도·경도 → 구면 좌표(북극 +Y, 경도 0 +Z, 반지름 보존)", () => {
    const north = latLonToVector(90, 0, 2);
    expect(north[1]).toBeCloseTo(2);
    const prime = latLonToVector(0, 0, 1);
    expect(prime[2]).toBeCloseTo(1);
    const [x, y, z] = latLonToVector(35.18, 129.08, 1.6);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1.6);
  });

  it("규모별 색과 높이는 규모가 커질수록 단조 증가/구분된다", () => {
    expect(quakeColor(2.6)).not.toBe(quakeColor(4.2));
    expect(new Set([2.6, 4.2, 5.4, 6.8].map(quakeColor)).size).toBe(4);
    expect(quakeHeight(7)).toBeGreaterThan(quakeHeight(5));
    expect(quakeHeight(5)).toBeGreaterThan(quakeHeight(2.5));
  });

  it("ISS 근사 궤도는 현재 위치를 지나고 구면 위에 놓이며 경사각 평면을 이룬다", () => {
    const path = orbitPath(20, 40, 2)!;
    expect(path).not.toBeNull();
    for (const [x, y, z] of path) expect(Math.hypot(x, y, z)).toBeCloseTo(2, 5);
    const [sx, sy, sz] = latLonToVector(20, 40, 2);
    expect(Math.hypot(path[0][0] - sx, path[0][1] - sy, path[0][2] - sz)).toBeLessThan(1e-6);
    // 궤도의 최고 위도는 경사각(51.64°)
    const maxLat = Math.max(...path.map(([x, y, z]) => Math.asin(y / Math.hypot(x, y, z)) * (180 / Math.PI)));
    expect(maxLat).toBeCloseTo(51.64, 0);
  });

  it("경사각보다 높은 위도에서는 궤도를 그리지 않는다", () => {
    expect(orbitPath(70, 10, 2)).toBeNull();
  });
});
