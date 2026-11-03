"use client";

import { useMemo, useState } from "react";
import {
  DAILY_LOG_RETENTION_DAYS,
  clearDailyLog,
  dailyLogToCsv,
  groupByDate,
  listMetrics,
  ratio,
  seriesFor,
} from "@/lib/history/daily-log";
import { useDailyLog } from "@/lib/history/use-daily-log";
import { TrendChart } from "./trend-chart";

const MATRIX_DAYS = 14;

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

export function DailyLogPanel() {
  const entries = useDailyLog();
  const days = useMemo(() => groupByDate(entries), [entries]);
  const metrics = useMemo(() => listMetrics(entries), [entries]);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [pickedMetric, setPickedMetric] = useState<string | null>(null);

  const selectedDate = days.some(([date]) => date === pickedDate) ? pickedDate! : days[0]?.[0];
  const selectedRows = days.find(([date]) => date === selectedDate)?.[1] ?? [];
  const metric = metrics.find((item) => item.key === pickedMetric) ?? metrics[0];
  const series = metric ? seriesFor(entries, metric.key, 30) : [];

  // 히트맵: 최근 14일(오래된 날짜 → 최신 날짜)
  const matrixDates = days.slice(0, MATRIX_DAYS).map(([date]) => date).reverse();
  const matrixCell = (key: string, date: string) => entries.find((entry) => entry.metricKey === key && entry.date === date);

  return (
    <section className="daily-log" aria-labelledby="daily-log-heading">
      <div className="section-heading">
        <div><span>02</span><h2 id="daily-log-heading">날짜별 자동 기록</h2></div>
        <p>기준 시간대 <strong>Asia/Seoul</strong> · 최근 {DAILY_LOG_RETENTION_DAYS}일 보관</p>
      </div>

      <div className="log-toolbar">
        <p>
          위젯이 정상 조회될 때마다 그날(KST)의 최신·최소·최대값을 이 브라우저에 저장합니다.
          같은 날짜는 지표당 한 줄로 합쳐지며, 서버에는 개인 기록을 보내지 않습니다.
        </p>
        <div>
          <button type="button" disabled={entries.length === 0} onClick={() => download("pulseboard-daily-log.csv", `﻿${dailyLogToCsv(entries)}`, "text/csv;charset=utf-8")}>CSV 내보내기</button>
          <button type="button" disabled={entries.length === 0} onClick={() => download("pulseboard-daily-log.json", JSON.stringify(entries, null, 2), "application/json")}>JSON 내보내기</button>
          <button
            type="button"
            disabled={entries.length === 0}
            onClick={() => { if (window.confirm("저장된 날짜별 기록을 모두 삭제할까요?")) clearDailyLog(); }}
          >기록 삭제</button>
        </div>
      </div>

      {days.length === 0 ? (
        <p className="log-empty">아직 저장된 기록이 없습니다. 위젯이 처음 정상 조회되면 오늘 날짜로 자동 기록됩니다.</p>
      ) : (
        <>
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
              {selectedRows.map((row) => (
                <li key={row.id}>
                  <div className="range-list__label">
                    <strong>{row.label}</strong>
                    <small>{row.samples}회 · 마지막 저장 {new Date(row.updatedAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })}</small>
                  </div>
                  <div className="range-bar" title={`최소 ${formatNumber(row.min, row.unit)} ~ 최대 ${formatNumber(row.max, row.unit)}`}>
                    <i className="range-bar__span" style={{ left: "0%", width: "100%" }} />
                    <i className="range-bar__marker" style={{ left: `${ratio(row.latest, row.min, row.max) * 100}%` }} />
                  </div>
                  <div className="range-list__values">
                    <span>최소 {formatNumber(row.min, row.unit)}</span>
                    <strong>{formatNumber(row.latest, row.unit)}</strong>
                    <span>최대 {formatNumber(row.max, row.unit)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="log-grid">
            <div className="log-matrix history-table-wrap">
              <table className="history-table">
                <caption>날짜 × 지표 한눈에 보기 (최근 {matrixDates.length}일, 색이 진할수록 그 지표의 높은 값)</caption>
                <thead>
                  <tr>
                    <th scope="col">지표</th>
                    {matrixDates.map((date) => <th scope="col" key={date}>{date.slice(5)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((item) => {
                    const cells = matrixDates.map((date) => matrixCell(item.key, date));
                    const present = cells.filter((cell) => cell !== undefined);
                    const lo = Math.min(...present.map((cell) => cell.latest));
                    const hi = Math.max(...present.map((cell) => cell.latest));
                    return (
                      <tr key={item.key}>
                        <th scope="row">{item.label}</th>
                        {cells.map((cell, index) => (
                          <td
                            key={matrixDates[index]}
                            className={cell ? "heat" : "heat heat--empty"}
                            style={cell ? ({ "--heat": `${Math.round(18 + ratio(cell.latest, lo, hi) * 62)}%` } as React.CSSProperties) : undefined}
                            title={cell ? `${matrixDates[index]} · ${formatNumber(cell.latest, item.unit)}` : "기록 없음"}
                          >
                            {cell ? new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(cell.latest) : "–"}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="log-trend">
              <div className="log-trend__head">
                <label htmlFor="trend-metric">추세 지표</label>
                <select id="trend-metric" value={metric?.key ?? ""} onChange={(event) => setPickedMetric(event.target.value)}>
                  {metrics.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </select>
              </div>
              {metric && <TrendChart series={series} unit={metric.unit} label={metric.label} />}
              <p className="log-trend__legend"><i className="legend-band" /> 그날 최소~최대 <i className="legend-line" /> 그날 마지막 값</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
