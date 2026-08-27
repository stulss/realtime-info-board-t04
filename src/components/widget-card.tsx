"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { formatAbsoluteTime, formatCountdown, formatRelativeTime } from "@/lib/time";
import { FAILURE_LABELS } from "@/lib/client/widget-state";
import type { WidgetPayload } from "@/types/widget";
import { StatusBadge } from "./status-badge";

type WidgetCardProps = {
  icon: string;
  name: string;
  data: WidgetPayload;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  controls?: ReactNode;
};

function subscribeClock(onStoreChange: () => void): () => void {
  const timer = window.setInterval(onStoreChange, 1_000);
  return () => window.clearInterval(timer);
}

function getCurrentTime(): number {
  return Date.now();
}

function getServerTime(): number {
  return 0;
}

function TimeValue({ label, value, fallback, now }: { label: string; value?: string; fallback?: string; now: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd title={formatAbsoluteTime(value)}>{value ? formatRelativeTime(value, now) : fallback ?? "API 미제공"}</dd>
    </div>
  );
}

export function WidgetCard({ icon, name, data, isRefreshing = false, onRefresh, controls }: WidgetCardProps) {
  const now = useSyncExternalStore(subscribeClock, getCurrentTime, getServerTime);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  const status = isRefreshing && data.status === "ok" ? "refreshing" : data.status;
  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1_000));
  const failureLabel = data.lastError?.kind ? FAILURE_LABELS[data.lastError.kind] : undefined;
  const isRetryState = status === "stale" || status === "rate_limited" || status === "error";

  function refresh() {
    if (!onRefresh || isRefreshing || cooldownSeconds > 0) return;
    setCooldownUntil(Date.now() + 10_000);
    onRefresh();
  }

  return (
    <article className="widget-card" data-status={status}>
      <div className="widget-card__accent" />
      <header className="widget-card__header">
        <div className="widget-card__identity">
          <span className="widget-card__icon" aria-hidden="true">{icon}</span>
          <div>
            <p className="eyebrow">LIVE WIDGET</p>
            <h2>{name}</h2>
          </div>
        </div>
        <StatusBadge status={status} />
      </header>

      {controls && <div className="widget-card__controls">{controls}</div>}

      <div className="widget-card__value" aria-live="polite">
        <strong>{data.value?.headline ?? "표시할 데이터 없음"}</strong>
        {data.value?.subline && <span>{data.value.subline}</span>}
      </div>

      {data.value?.details && data.value.details.length > 0 && (
        <dl className="widget-card__details">
          {data.value.details.map((detail) => (
            <div key={detail.label}>
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {(data.warning || data.lastError) && (
        <p className="widget-card__warning" role="status">
          {failureLabel && <strong>장애 유형: {failureLabel}</strong>}
          <span>{data.warning ?? data.lastError?.message}</span>
        </p>
      )}

      <dl className="widget-card__times">
        <TimeValue label="원천 시각" value={data.sourceTimestamp} now={now} />
        <TimeValue label="조회 시각" value={data.fetchedAt} fallback="조회 기록 없음" now={now} />
      </dl>

      <footer className="widget-card__footer">
        <div className="source-block">
          <span>출처</span>
          <a href={data.source.docsUrl} target="_blank" rel="noreferrer">
            {data.source.provider} <span aria-hidden="true">↗</span>
          </a>
          <code>{data.source.endpointTemplate}</code>
        </div>
        <div className="refresh-block">
          <span>{cooldownSeconds > 0 ? `수동 갱신 ${cooldownSeconds}초 후` : now === 0 ? "갱신 시각 계산 중" : formatCountdown(data.nextRefreshAt, now)}</span>
          {onRefresh && (
            <button type="button" onClick={refresh} disabled={isRefreshing || cooldownSeconds > 0} aria-label={`${name} 새로고침`}>
              <span aria-hidden="true">↻</span>
              {isRetryState && <b>다시 시도</b>}
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}
