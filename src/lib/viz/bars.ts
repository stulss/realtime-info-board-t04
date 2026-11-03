import type { DailyLogEntry } from "@/lib/history/daily-log";

/** 색각 이상에서도 구분되는 Okabe-Ito 팔레트 */
export const METRIC_PALETTE = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#F0E442", "#8C8C8C"] as const;

export type BarMetric = { key: string; label: string; unit: string; color: string; lo: number; hi: number };

export type BarCell = {
  date: string;
  metricKey: string;
  /** 날짜 축 인덱스(0 = 가장 오래된 날) */
  x: number;
  /** 지표 축 인덱스 */
  z: number;
  value: number;
  min: number;
  max: number;
  samples: number;
  closed: boolean;
  /** 지표별 0~1 정규화 높이 */
  norm: number;
};

export type BarGrid = { dates: string[]; metrics: BarMetric[]; cells: BarCell[] };

type Options = { maxDates?: number; maxMetrics?: number };

/**
 * 날짜별 기록을 3D 막대 격자로 바꾼다(순수 함수).
 * - 날짜 축: 기록이 있는 최근 N일(오래된 날 → 최신)
 * - 지표 축: 기록 일수가 많은 순 상위 M개. 단위가 달라도 비교할 수 있게 지표별 0~1로 정규화한다.
 */
export function buildBarGrid(entries: DailyLogEntry[], { maxDates = 60, maxMetrics = 8 }: Options = {}): BarGrid {
  const allDates = [...new Set(entries.map((entry) => entry.date))].sort();
  const dates = allDates.slice(-maxDates);
  const dateIndex = new Map(dates.map((date, index) => [date, index]));

  const visible = entries.filter((entry) => dateIndex.has(entry.date));
  const coverage = new Map<string, { label: string; unit: string; days: number }>();
  for (const entry of visible) {
    const found = coverage.get(entry.metricKey);
    coverage.set(entry.metricKey, { label: entry.label, unit: entry.unit, days: (found?.days ?? 0) + 1 });
  }
  const chosen = [...coverage.entries()]
    .filter(([, info]) => info.days >= 2)
    .sort((a, b) => b[1].days - a[1].days || a[1].label.localeCompare(b[1].label, "ko"))
    .slice(0, maxMetrics);

  const metrics: BarMetric[] = chosen.map(([key, info], index) => {
    const values = visible.filter((entry) => entry.metricKey === key).map((entry) => entry.latest);
    return { key, label: info.label, unit: info.unit, color: METRIC_PALETTE[index % METRIC_PALETTE.length], lo: Math.min(...values), hi: Math.max(...values) };
  });
  const metricIndex = new Map(metrics.map((metric, index) => [metric.key, index]));

  const cells: BarCell[] = [];
  for (const entry of visible) {
    const z = metricIndex.get(entry.metricKey);
    const x = dateIndex.get(entry.date);
    if (z === undefined || x === undefined) continue;
    const { lo, hi } = metrics[z];
    cells.push({
      date: entry.date, metricKey: entry.metricKey, x, z, value: entry.latest, min: entry.min, max: entry.max,
      samples: entry.samples, closed: entry.closed === true, norm: hi === lo ? 0.5 : (entry.latest - lo) / (hi - lo),
    });
  }
  return { dates, metrics, cells };
}
