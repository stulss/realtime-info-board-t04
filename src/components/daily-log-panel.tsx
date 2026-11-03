"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  DAILY_LOG_EVENT,
  DAILY_LOG_RETENTION_DAYS,
  DAILY_LOG_STORAGE_KEY,
  clearDailyLog,
  dailyLogToCsv,
  groupByDate,
  parseDailyLog,
  type DailyLogEntry,
} from "@/lib/history/daily-log";

const EMPTY: DailyLogEntry[] = [];
let cachedRaw: string | null | undefined;
let cachedEntries: DailyLogEntry[] = EMPTY;

function subscribe(onChange: () => void) {
  window.addEventListener(DAILY_LOG_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DAILY_LOG_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** useSyncExternalStore는 같은 입력에 같은 참조를 요구하므로 raw 문자열 기준으로 캐시한다. */
function getSnapshot(): DailyLogEntry[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(DAILY_LOG_STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedEntries = parseDailyLog(raw);
  }
  return cachedEntries;
}

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
  const entries = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const days = useMemo(() => groupByDate(entries), [entries]);

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
        days.map(([date, rows]) => (
          <div className="log-day" key={date}>
            <h3>{date}<small>{rows.length}개 지표</small></h3>
            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr><th>지표</th><th>최신</th><th>최소</th><th>최대</th><th>표본</th><th>마지막 저장</th></tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.label}</td>
                      <td>{formatNumber(row.latest, row.unit)}</td>
                      <td>{formatNumber(row.min, row.unit)}</td>
                      <td>{formatNumber(row.max, row.unit)}</td>
                      <td>{row.samples}회</td>
                      <td>{new Date(row.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
