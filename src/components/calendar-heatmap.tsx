import type { CSSProperties } from "react";
import { fmtNum, type DailyLogEntry } from "@/lib/history/daily-log";
import { buildCalendar } from "@/lib/viz/calendar";

const CELL = 15;
const GAP = 3;
const LEFT = 26;
const TOP = 20;
const WEEKDAY_LABELS: Record<number, string> = { 1: "월", 3: "수", 5: "금" };

type Props = {
  /** 한 지표의 날짜별 기록(순서 무관) */
  entries: DailyLogEntry[];
  unit: string;
  label: string;
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
};

/**
 * GitHub 기여 그래프식 달력 히트맵. 주(열) × 요일(행)로 배치해 요일·주간 패턴이 보인다.
 * 색은 지표 안의 상대 크기(값이 클수록 진함)이며, 정확한 값은 칸을 누르거나 툴팁으로 확인한다.
 */
export function CalendarHeatmap({ entries, unit, label, selectedDate, onSelectDate }: Props) {
  const calendar = buildCalendar(entries);
  if (calendar.weeks.length === 0) return <p className="log-empty">선택한 지표의 기록이 없습니다.</p>;

  const width = LEFT + calendar.weeks.length * (CELL + GAP);
  const height = TOP + 7 * (CELL + GAP);

  return (
    <figure className="cal">
      <svg className="cal__svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${label} 달력 히트맵, 기록 ${calendar.covered}일`}>
        {calendar.months.filter((month, index, all) => index === 0 || month.week - all[index - 1].week >= 3).map((month) => (
          <text key={`${month.week}-${month.label}`} className="cal__axis" x={LEFT + month.week * (CELL + GAP)} y={12}>{month.label}</text>
        ))}
        {Object.entries(WEEKDAY_LABELS).map(([weekday, text]) => (
          <text key={weekday} className="cal__axis" x={0} y={TOP + Number(weekday) * (CELL + GAP) + CELL - 3}>{text}</text>
        ))}
        {calendar.weeks.map((week, weekIndex) => week.days.map((day, dayIndex) => {
          if (!day) return null;
          const x = LEFT + weekIndex * (CELL + GAP);
          const y = TOP + dayIndex * (CELL + GAP);
          const has = day.entry !== undefined;
          const style = has ? ({ "--heat": `${Math.round(14 + (day.norm ?? 0) * 76)}%` } as CSSProperties) : undefined;
          const selected = day.date === selectedDate;
          const title = has ? `${day.date} · ${fmtNum(day.entry!.latest)} ${unit}${day.entry!.closed ? " (과거 원자료)" : ""}` : `${day.date} · 기록 없음`;
          return (
            <g key={day.date}>
              <title>{title}</title>
              <rect
                className={`cal__cell${has ? " cal__cell--has" : ""}${selected ? " cal__cell--selected" : ""}`}
                x={x} y={y} width={CELL} height={CELL} rx={3} style={style}
                role={has ? "button" : undefined} tabIndex={has ? 0 : undefined} aria-label={has ? title : undefined}
                onClick={has ? () => onSelectDate?.(day.date) : undefined}
                onKeyDown={has ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectDate?.(day.date); } } : undefined}
              />
            </g>
          );
        }))}
      </svg>
      <figcaption className="cal__legend">
        <span>낮음 {fmtNum(calendar.lo)}</span>
        <i className="cal__ramp" aria-hidden="true" />
        <span>높음 {fmtNum(calendar.hi)} {unit}</span>
        <small>{calendar.covered}/{calendar.total}일 기록</small>
      </figcaption>
    </figure>
  );
}
