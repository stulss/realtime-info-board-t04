"use client";

import { useMemo, useState } from "react";
import {
  DAILY_LOG_RETENTION_DAYS,
  clearDailyLog,
  dailyLogToCsv,
  formatDelta,
  groupByDate,
  listMetrics,
  ratio,
  seriesFor,
} from "@/lib/history/daily-log";
import type { DailyLogEntry } from "@/lib/history/daily-log";
import { HISTORY_START_DATE, upbitDailyCount } from "@/lib/history/range";
import { upbitSourceUrl } from "@/lib/history/upbit-closes";
import { useDailyLog } from "@/lib/history/use-daily-log";
import { CalendarHeatmap } from "./calendar-heatmap";
import { SmallMultiples } from "./small-multiples";
import { TrendChart } from "./trend-chart";

const VIEWS = [
  { id: "trend", title: "추세", desc: "선택한 지표의 날짜별 변화. 면적은 그날 최소~최대, 선은 그날 마지막 값입니다." },
  { id: "calendar", title: "달력", desc: "하루를 한 칸으로 놓아 요일·주간 패턴을 봅니다. 색이 진할수록 그 지표 안에서 높은 값이고, 칸을 누르면 그날 기록으로 이동합니다." },
] as const;

function formatNumber(value: number, unit: string): string {
  const text = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
  return `${text} ${unit}`;
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

type DailyLogPanelProps = {
  /** 외부(3D 지형 등)에서 고른 날짜. 없으면 가장 최근 날짜. */
  selectedDate?: string | null;
  onSelectDate?: (date: string) => void;
};

export function DailyLogPanel({ selectedDate: controlledDate, onSelectDate }: DailyLogPanelProps = {}) {
  const entries = useDailyLog();
  const days = useMemo(() => groupByDate(entries), [entries]);
  const metrics = useMemo(() => listMetrics(entries), [entries]);
  const [localDate, setLocalDate] = useState<string | null>(null);
  const pickedDate = controlledDate ?? localDate;
  const setPickedDate = (date: string) => { setLocalDate(date); onSelectDate?.(date); };
  const [pickedMetric, setPickedMetric] = useState<string | null>(null);
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("trend");

  const selectedDate = days.some(([date]) => date === pickedDate) ? pickedDate! : days[0]?.[0];
  const selectedRows = days.find(([date]) => date === selectedDate)?.[1] ?? [];
  const metric = metrics.find((item) => item.key === pickedMetric) ?? metrics[0];
  const series = metric ? seriesFor(entries, metric.key, 400) : [];


  return (
    <section className="daily-log" id="daily-log" aria-labelledby="daily-log-heading">
      <div className="section-heading">
        <div><span>02</span><h2 id="daily-log-heading">날짜별 자동 기록</h2></div>
        <p>기준 시간대 <strong>Asia/Seoul</strong> · 최대 {DAILY_LOG_RETENTION_DAYS}일 보관</p>
      </div>

      <p className="log-intro">
        위젯 값을 <strong>하루 한 줄씩 자동 저장</strong>합니다. {Number(HISTORY_START_DATE.slice(5, 7))}월 {Number(HISTORY_START_DATE.slice(8, 10))}일부터 어제까지는 과거 원자료로 채웠고, 오늘부터는 실시간으로 쌓입니다.
        <span> · {days.length}일 기록 · 이 브라우저에만 저장</span>
      </p>

      {entries.length > 0 && (
        <SmallMultiples
          entries={entries}
          activeKey={view === "trend" || view === "calendar" ? metric?.key : undefined}
          onPick={(key) => { setPickedMetric(key); setView("trend"); document.getElementById("log-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
        />
      )}

      {days.length === 0 ? (
        <p className="log-empty">아직 저장된 기록이 없습니다. 위젯이 처음 정상 조회되면 오늘 날짜로 자동 기록됩니다.</p>
      ) : (
        <>
          <h3 className="log-detail__title" id="log-detail">날짜별로 자세히</h3>
          <div className="log-timeline" role="tablist" aria-label="기록된 날짜">
            {days.map(([date, rows]) => (
              <button
                key={date}
                type="button"
                role="tab"
                aria-selected={date === selectedDate}
                className="log-chip"
                onClick={() => setPickedDate(date)}
              >
                <b>{date.slice(5)}</b>
                <small>{date.slice(0, 4)}</small>
                <span>{rows.length}개 지표</span>
              </button>
            ))}
          </div>

          <div className="log-day" role="tabpanel" aria-label={`${selectedDate} 기록`}>
            <h3>{selectedDate}<small>{selectedRows.length}개 지표 기록됨</small></h3>
            <ul className="range-list">
              {selectedRows.map((row) => {
                const previous = previousOf(entries, row);
                const delta = previous ? row.latest - previous.latest : null;
                const percent = previous && previous.latest !== 0 ? ((row.latest - previous.latest) / Math.abs(previous.latest)) * 100 : null;
                return (
                <li key={row.id}>
                  <div className="range-list__label">
                    <strong>{row.label}</strong>
                    <small>
                      {row.closed ? "과거 원자료로 자동 채움" : `${row.samples}회 · 마지막 저장 ${new Date(row.updatedAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })}`}
                    </small>
                    {previous && delta !== null && (
                      <small className="range-list__delta" data-dir={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}>
                        {delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} {previous.date.slice(5)} 대비 {formatDelta(delta, percent)}
                      </small>
                    )}
                  </div>
                  <div className="range-bar" data-flat={row.min === row.max || undefined} title={row.min === row.max ? "범위 없음(값이 하나뿐)" : `최소 ${formatNumber(row.min, row.unit)} ~ 최대 ${formatNumber(row.max, row.unit)}`}>
                    <i className="range-bar__span" style={{ left: "0%", width: "100%" }} />
                    <i className="range-bar__marker" style={{ left: `${ratio(row.latest, row.min, row.max) * 100}%` }} />
                  </div>
                  <div className="range-list__values">
                    <span>최소 {formatNumber(row.min, row.unit)}</span>
                    <strong>{formatNumber(row.latest, row.unit)}</strong>
                    <span>최대 {formatNumber(row.max, row.unit)}</span>
                  </div>
                </li>
                );
              })}
            </ul>
          </div>

          <div className="log-views">
            <div className="log-views__bar">
              <div className="filter-chips" role="tablist" aria-label="기록 보기 방식">
                {VIEWS.map((item) => (
                  <button key={item.id} type="button" role="tab" id={`log-tab-${item.id}`} className="filter-chip" aria-selected={view === item.id} aria-controls="log-view-panel" onClick={() => setView(item.id)}>
                    {item.title}
                  </button>
                ))}
              </div>
              {(
                <label className="log-views__metric">
                  <span>지표</span>
                  <select aria-label="지표 선택" value={metric?.key ?? ""} onChange={(event) => setPickedMetric(event.target.value)}>
                    {metrics.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                </label>
              )}
            </div>
            <p className="log-views__desc">{VIEWS.find((item) => item.id === view)!.desc}</p>
            <div id="log-view-panel" role="tabpanel" aria-labelledby={`log-tab-${view}`} className="log-views__panel">
              {view === "trend" && metric && (
                <>
                  <TrendChart series={series} unit={metric.unit} label={metric.label} />
                  <p className="log-trend__legend"><i className="legend-band" /> 그날 최소~최대 <i className="legend-line" /> 그날 마지막 값</p>
                </>
              )}
              {view === "calendar" && metric && (
                <CalendarHeatmap entries={series} unit={metric.unit} label={metric.label} selectedDate={selectedDate} onSelectDate={setPickedDate} />
              )}
            </div>
          </div>
        </>
      )}
      <div className="log-actions">
        <button type="button" disabled={entries.length === 0} onClick={() => download("daylog-daily-log.csv", `﻿${dailyLogToCsv(entries)}`, "text/csv;charset=utf-8")}>CSV 내보내기</button>
        <button type="button" disabled={entries.length === 0} onClick={() => download("daylog-daily-log.json", JSON.stringify(entries, null, 2), "application/json")}>JSON 내보내기</button>
        <button type="button" disabled={entries.length === 0} onClick={() => { if (window.confirm("저장된 날짜별 기록을 모두 삭제할까요?")) clearDailyLog(); }}>기록 삭제</button>
      </div>
      <p className="log-source">
        <span>자동 채움 출처</span>
        <a href={upbitSourceUrl()} target="_blank" rel="noreferrer">Upbit 일봉 원자료 ↗</a>
        <code>GET /v1/candles/days?market=KRW-BTC&amp;count={upbitDailyCount()}</code>
      </p>
    </section>
  );
}

/** 같은 지표의 바로 이전 기록(더 오래된 날짜 중 가장 최근). */
function previousOf(entries: DailyLogEntry[], row: DailyLogEntry): DailyLogEntry | undefined {
  return entries
    .filter((entry) => entry.metricKey === row.metricKey && entry.date < row.date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}
