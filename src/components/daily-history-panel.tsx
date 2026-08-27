"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DAILY_RECORD_STORAGE_KEY,
  calculateDailyComparison,
  isDailyHistoryResponse,
  mergeDailyRecords,
  parseDailyRecords,
  type DailyHistoryResponse,
  type DailyRecord,
} from "@/lib/history/daily-records";

const VALUE_FORMAT = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

async function fetchDailyHistory(): Promise<DailyHistoryResponse> {
  const response = await fetch("/api/widgets/upbit-daily-history");
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body
      ? String(body.error)
      : "일별 기록을 가져오지 못했습니다.";
    throw new Error(message);
  }
  if (!isDailyHistoryResponse(body)) throw new Error("일별 기록 응답 형식이 변경되었습니다.");
  return body;
}

function formatValue(record: DailyRecord): string {
  return record.unit === "KRW" ? VALUE_FORMAT.format(record.value) : `${record.value} ${record.unit}`;
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(parsed);
}

export function DailyHistoryPanel() {
  const query = useQuery({
    queryKey: ["daily-history", "KRW-BTC"],
    queryFn: fetchDailyHistory,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const records = useMemo(() => {
    if (!query.data || typeof window === "undefined") return [];
    const existing = parseDailyRecords(window.localStorage.getItem(DAILY_RECORD_STORAGE_KEY));
    const existingById = new Map(existing.map((record) => [record.id, record]));
    const newRecords = query.data.records.map((record) => existingById.get(record.id) ?? {
      ...record,
      storedAt: new Date().toISOString(),
    });
    return mergeDailyRecords(existing, newRecords);
  }, [query.data]);

  useEffect(() => {
    if (records.length > 0) {
      window.localStorage.setItem(DAILY_RECORD_STORAGE_KEY, JSON.stringify(records));
    }
  }, [records]);

  const visibleRecords = useMemo(() => records.slice(0, 2), [records]);
  const sourceById = useMemo(
    () => new Map(query.data?.records.map((record) => [record.id, record]) ?? []),
    [query.data],
  );
  const hasIntegrityMismatch = visibleRecords.some((stored) => {
    const source = sourceById.get(stored.id);
    return !source
      || source.metric !== stored.metric
      || source.date !== stored.date
      || source.timezone !== stored.timezone
      || source.value !== stored.value
      || source.unit !== stored.unit
      || source.sourceTimestamp !== stored.sourceTimestamp;
  });
  const comparison = useMemo(
    () => hasIntegrityMismatch ? null : calculateDailyComparison(visibleRecords),
    [hasIntegrityMismatch, visibleRecords],
  );
  const signedDifference = comparison
    ? `${comparison.difference > 0 ? "+" : ""}${VALUE_FORMAT.format(comparison.difference)}`
    : "";

  return (
    <section className="daily-history" aria-labelledby="daily-history-heading">
      <div className="section-heading">
        <div><span>02</span><h2 id="daily-history-heading">하루 한 번 기록</h2></div>
        <p>기준 시간대: <strong>Asia/Seoul</strong></p>
      </div>
      <div className="history-intro">
        <div>
          <p className="eyebrow">DAILY EVIDENCE</p>
          <h3>이 정보판은 KRW-BTC의 실제 일별 가격 변화를 확인하기 위한 것이다.</h3>
          <p>Upbit의 실제 일봉을 날짜와 데이터 종류로 식별해 같은 날짜는 한 건만 저장합니다.</p>
        </div>
        <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? "동기화 중" : "일별 기록 동기화"}
        </button>
      </div>

      {query.error && <p className="history-error" role="alert">{query.error.message}</p>}
      {hasIntegrityMismatch && (
        <p className="history-error" role="alert">원자료와 저장값이 달라 비교 계산을 중단했습니다. 저장 기록을 확인해 주세요.</p>
      )}

      <div className="comparison-card" aria-live="polite">
        {comparison ? (
          <>
            <div>
              <span>이전 기록</span>
              <strong>{comparison.previousDate} · {VALUE_FORMAT.format(comparison.previousValue)}</strong>
            </div>
            <div>
              <span>현재 기록</span>
              <strong>{comparison.currentDate} · {VALUE_FORMAT.format(comparison.currentValue)}</strong>
            </div>
            <div>
              <span>이전 대비 변화</span>
              <strong>
                {comparison.direction} {signedDifference}
                {comparison.percentage !== null && ` (${comparison.percentage.toFixed(2)}%)`}
              </strong>
              <small>단위: {comparison.unit}</small>
            </div>
          </>
        ) : (
          <p>{hasIntegrityMismatch ? "원자료와 저장값이 일치해야 비교값을 표시합니다." : "서로 다른 날짜의 같은 단위 기록 2건이 모이면 비교값을 표시합니다."}</p>
        )}
      </div>

      <div className="history-table-wrap">
        <table className="history-table">
          <caption>서로 다른 실제 날짜 기록 {visibleRecords.length}건 · 같은 날짜 중복 없음</caption>
          <thead>
            <tr>
              <th>날짜</th>
              <th>원자료 값</th>
              <th>저장값</th>
              <th>계산 입력값</th>
              <th>화면값</th>
              <th>단위</th>
              <th>조회·저장 시각</th>
            </tr>
          </thead>
          <tbody>
            {visibleRecords.map((record) => (
              <tr key={record.id}>
                <td>{record.date}</td>
                <td>{sourceById.has(record.id) ? formatValue(sourceById.get(record.id)!) : "원자료 없음"}</td>
                <td>{formatValue(record)}</td>
                <td>{formatValue(record)}</td>
                <td>{formatValue(record)}</td>
                <td>{record.unit}</td>
                <td>조회 {formatDateTime(record.fetchedAt)}<br />저장 {formatDateTime(record.storedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {query.data && (
        <div className="history-source">
          <span>출처</span>
          <a href={query.data.source.url} target="_blank" rel="noreferrer">{query.data.source.provider} 원자료 ↗</a>
          <code>{query.data.source.endpointTemplate}</code>
          <span>자료 조회 시각 {formatDateTime(query.data.fetchedAt)}</span>
        </div>
      )}
    </section>
  );
}
