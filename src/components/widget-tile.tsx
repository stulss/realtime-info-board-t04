"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FAILURE_LABELS } from "@/lib/client/widget-state";
import { compareToPrevious, fmtNum, formatDelta, ratio, type DailyLogEntry } from "@/lib/history/daily-log";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/time";
import type { WidgetPayload } from "@/types/widget";
import { Icon } from "./icons";
import { Sparkline } from "./sparkline";
import { StatusBadge } from "./status-badge";

type WidgetTileProps = {
  icon: ReactNode;
  name: string;
  data: WidgetPayload;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  controls?: ReactNode;
  history?: DailyLogEntry[];
  size?: "wide";
};

const ARROW = { up: "▲", down: "▼", flat: "■" } as const;
const DIRECTION_TEXT = { up: "상승", down: "하락", flat: "변화 없음" } as const;

/**
 * 대시보드용 컴팩트 타일.
 * 1단계(항상 보임): 이름·상태·핵심 값·7일 스파크라인·직전 기록 대비
 * 2단계("상세 보기"): 세부 항목·오늘 범위·원천/조회 시각·출처·조작 UI
 * 장애·키 미설정처럼 예외 상황은 접지 않고 한 줄로 바로 보여준다.
 */
export function WidgetTile({ icon, name, data, isRefreshing = false, onRefresh, controls, history, size }: WidgetTileProps) {
  const detailId = useId();
  const [open, setOpen] = useState(false);
  const [cooling, setCooling] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const status = isRefreshing && data.status === "ok" ? "refreshing" : data.status;
  const isEmpty = !data.value;
  const failureLabel = data.lastError?.kind ? FAILURE_LABELS[data.lastError.kind] : undefined;
  const metric = data.value?.metric;
  const comparison = metric && history ? compareToPrevious(history, metric.value) : null;
  const today = history?.[history.length - 1];
  const showDot = status === "ok" || (status === "refreshing" && data.status === "ok");

  function refresh() {
    if (!onRefresh || isRefreshing || cooling) return;
    setCooling(true);
    timer.current = window.setTimeout(() => setCooling(false), 10_000);
    onRefresh();
  }

  return (
    <article className="tile" data-status={status} data-empty={isEmpty || undefined} data-size={size} data-open={open || undefined}>
      <header className="tile__head">
        <span className="tile__icon" aria-hidden="true">{icon}</span>
        <h3 className="tile__name">{name}</h3>
        {showDot
          ? <span className="tile__dot" data-refreshing={status === "refreshing" || undefined} role="img" aria-label={`상태: ${status === "refreshing" ? "갱신 중" : "정상"}`} />
          : <StatusBadge status={status} />}
        {onRefresh && (
          <button className="tile__refresh" type="button" onClick={refresh} disabled={isRefreshing || cooling} aria-label={`${name} 새로고침`} title={cooling ? "10초 후 다시 갱신할 수 있습니다" : "새로고침"}>
            <Icon name="refresh" size={14} />
          </button>
        )}
      </header>

      {isEmpty ? (
        <div className="tile__empty">
          <strong>{status === "refreshing" ? "불러오는 중" : failureLabel ?? "표시할 데이터 없음"}</strong>
          <span>{data.warning ?? data.lastError?.message ?? "첫 조회를 기다리는 중입니다."}</span>
        </div>
      ) : (
        <>
          <div className="tile__body">
            <div className="tile__value" aria-live="polite">
              <strong>{data.value?.headline}</strong>
              {data.value?.subline && <span>{data.value.subline}</span>}
            </div>
            {history && history.length >= 2 && (
              <div className="tile__spark">
                <Sparkline values={history.map((entry) => entry.latest)} label={`${name} 최근 ${history.length}일 추세`} height={36} />
              </div>
            )}
          </div>
          {comparison && (
            <p className="tile__delta" data-dir={comparison.direction}>
              <span aria-hidden="true">{ARROW[comparison.direction]}</span>
              <b>{DIRECTION_TEXT[comparison.direction]} {formatDelta(comparison.diff, comparison.percent)}</b>
              <small>{comparison.previousDate.slice(5)} 대비</small>
            </p>
          )}
        </>
      )}

      {!isEmpty && (data.status === "stale" || data.status === "maintenance" || data.status === "rate_limited") && (
        <p className="tile__alert" role="status">
          {failureLabel && <b>{failureLabel}</b>} {data.warning ?? data.lastError?.message}
        </p>
      )}

      <footer className="tile__foot">
        <span title={formatAbsoluteTime(data.fetchedAt)}>
          {data.fetchedAt ? `${data.source.provider.split(" (")[0]} · ${formatRelativeTime(data.fetchedAt)}` : data.source.provider}
        </span>
        {!isEmpty || controls ? (
          <button className="tile__more" type="button" aria-expanded={open} aria-controls={detailId} onClick={() => setOpen((value) => !value)}>
            {open ? "접기" : "상세"}<Icon name={open ? "up" : "down"} size={12} />
          </button>
        ) : null}
      </footer>

      {open && (
        <div className="tile__detail" id={detailId}>
          {controls && <div className="tile__controls">{controls}</div>}
          {data.value?.details && data.value.details.length > 0 && (
            <dl className="tile__facts">
              {data.value.details.map((detail) => (
                <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>
              ))}
            </dl>
          )}
          {today && (
            <div className="tile__range">
              <small>오늘({today.date.slice(5)}) 범위 · {today.samples}회 기록</small>
              <div className="range-bar" data-flat={today.min === today.max || undefined} title={`최소 ${fmtNum(today.min)} ~ 최대 ${fmtNum(today.max)} ${today.unit}`}>
                <i className="range-bar__span" style={{ left: "0%", width: "100%" }} />
                <i className="range-bar__marker" style={{ left: `${ratio(today.latest, today.min, today.max) * 100}%` }} />
              </div>
              <small className="tile__range-values"><span>{fmtNum(today.min)}</span><span>{fmtNum(today.max)} {today.unit}</span></small>
            </div>
          )}
          <dl className="tile__times">
            <div><dt>원천 시각</dt><dd>{data.sourceTimestamp ? formatRelativeTime(data.sourceTimestamp) : "API 미제공"}</dd></div>
            <div><dt>조회 시각</dt><dd>{data.fetchedAt ? formatRelativeTime(data.fetchedAt) : "조회 기록 없음"}</dd></div>
          </dl>
          <p className="tile__source">
            <a href={data.source.docsUrl} target="_blank" rel="noreferrer">{data.source.provider} ↗</a>
            <code>{data.source.endpointTemplate}</code>
          </p>
        </div>
      )}
    </article>
  );
}
