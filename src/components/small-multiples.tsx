import { fmtNum, formatDelta, listMetrics, seriesFor, type DailyLogEntry } from "@/lib/history/daily-log";
import { Sparkline } from "./sparkline";

type Props = {
  entries: DailyLogEntry[];
  /** 한 칸에 그릴 최근 일수 */
  days?: number;
  activeKey?: string;
  onPick?: (metricKey: string) => void;
};

/**
 * 작은 다중 차트(small multiples): 모든 지표를 같은 크기·같은 형식의 작은 추세선으로 나란히 둔다.
 * 축·격자 없이 모양만 보여 지표끼리 한눈에 비교하고, 누르면 그 지표의 상세 차트로 이동한다.
 */
export function SmallMultiples({ entries, days = 30, activeKey, onPick }: Props) {
  const metrics = listMetrics(entries);
  if (metrics.length === 0) return <p className="log-empty">기록이 쌓이면 지표별 추세가 여기에 나란히 표시됩니다.</p>;

  return (
    <ul className="smalls" aria-label="지표별 추세 한눈에 비교">
      {metrics.map((metric) => {
        const series = seriesFor(entries, metric.key, days);
        const latest = series[series.length - 1];
        const previous = series.length > 1 ? series[series.length - 2] : undefined;
        const diff = previous ? latest.latest - previous.latest : undefined;
        const percent = previous && previous.latest !== 0 ? ((latest.latest - previous.latest) / Math.abs(previous.latest)) * 100 : null;
        const lo = Math.min(...series.map((entry) => entry.latest));
        const hi = Math.max(...series.map((entry) => entry.latest));
        return (
          <li key={metric.key}>
            <button type="button" className="smalls__item" aria-pressed={activeKey === metric.key} onClick={() => onPick?.(metric.key)}>
              <span className="smalls__label">{metric.label}</span>
              <span className="smalls__value">
                <strong>{fmtNum(latest.latest)}</strong>
                <small>{metric.unit}</small>
                {diff !== undefined && previous && (
                  <b className="smalls__delta" data-dir={diff > 0 ? "up" : diff < 0 ? "down" : "flat"} title={`${previous.date.slice(5)} 대비`}>
                    {diff > 0 ? "▲" : diff < 0 ? "▼" : "■"} {formatDelta(diff, percent)}
                  </b>
                )}
              </span>
              <span className="smalls__spark">
                {series.length > 1
                  ? <Sparkline values={series.map((entry) => entry.latest)} label={`${metric.label} 최근 ${series.length}일 추세`} width={240} height={56} />
                  : <small>기록 1일 — 내일부터 추세가 그려집니다</small>}
              </span>
              <span className="smalls__meta">
                <small>최근 {series.length}일</small>
                <small>{fmtNum(lo)} ~ {fmtNum(hi)}</small>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
