import type { DailyLogEntry } from "@/lib/history/daily-log";

const W = 760;
const H = 240;
const M = { top: 20, right: 24, bottom: 34, left: 58 };

function fmt(value: number): string {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: Math.abs(value) < 100 ? 2 : 0 }).format(value);
}

/**
 * 날짜별 추세 차트(SVG).
 * 면적 = 그날 최소~최대 범위, 선 = 그날 마지막 값. 점마다 값 툴팁(title)을 제공한다.
 */
export function TrendChart({ series, unit, label }: { series: DailyLogEntry[]; unit: string; label: string }) {
  if (series.length === 0) return <p className="log-empty">선택한 지표의 기록이 없습니다.</p>;

  const lo = Math.min(...series.map((entry) => entry.min));
  const hi = Math.max(...series.map((entry) => entry.max));
  const span = hi - lo || Math.max(Math.abs(hi) * 0.1, 1);
  const yMin = lo - span * 0.12;
  const yMax = hi + span * 0.12;
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const x = (index: number) => M.left + (series.length === 1 ? innerW / 2 : (index * innerW) / (series.length - 1));
  const y = (value: number) => M.top + innerH - ((value - yMin) / (yMax - yMin)) * innerH;

  const line = series.map((entry, index) => `${x(index).toFixed(1)},${y(entry.latest).toFixed(1)}`).join(" ");
  const band = [
    ...series.map((entry, index) => `${x(index).toFixed(1)},${y(entry.max).toFixed(1)}`),
    ...series.map((entry, index) => `${x(series.length - 1 - index).toFixed(1)},${y(series[series.length - 1 - index].min).toFixed(1)}`),
  ].join(" ");
  const ticks = [yMin + (yMax - yMin) * 0.1, (yMin + yMax) / 2, yMax - (yMax - yMin) * 0.1];
  const labelStep = Math.max(1, Math.ceil(series.length / 8));

  return (
    <svg className="trend-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} 날짜별 추세 차트, ${series.length}일`}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line className="trend-chart__grid" x1={M.left} x2={W - M.right} y1={y(tick)} y2={y(tick)} />
          <text className="trend-chart__axis" x={M.left - 8} y={y(tick) + 3} textAnchor="end">{fmt(tick)}</text>
        </g>
      ))}
      {series.length > 1 && <polygon className="trend-chart__band" points={band} />}
      {series.length > 1 && <polyline className="trend-chart__line" points={line} pathLength={1} />}
      {series.map((entry, index) => (
        <g key={entry.id} className="trend-chart__point" style={{ animationDelay: `${index * 60}ms` }}>
          <title>{`${entry.date} · 최신 ${fmt(entry.latest)} ${unit} · 최소 ${fmt(entry.min)} · 최대 ${fmt(entry.max)} · ${entry.samples}회`}</title>
          <circle cx={x(index)} cy={y(entry.latest)} r={4.5} />
          {index % labelStep === 0 || index === series.length - 1 ? (
            <text className="trend-chart__axis" x={x(index)} y={H - 10} textAnchor="middle">{entry.date.slice(5)}</text>
          ) : null}
        </g>
      ))}
      <text className="trend-chart__unit" x={M.left} y={12}>{unit}</text>
    </svg>
  );
}
