"use client";

import { useState } from "react";
import { verificationFixtures } from "@/fixtures/widgets";
import {
  FAILURE_LABELS,
  displayPayloadAfterFailure,
  fetchWidgetPayload,
} from "@/lib/client/widget-state";
import type { WidgetFailureKind, WidgetPayload } from "@/types/widget";
import { WidgetCard } from "./widget-card";

type VerificationKind = Exclude<WidgetFailureKind, "provider_error">;

const FAILURE_SCENARIOS: Array<{
  kind: VerificationKind;
  reproduce: string;
  message: string;
}> = [
  { kind: "timeout", reproduce: "검증 API가 제한 시간보다 늦게 응답", message: "요청 응답 시간이 초과되었습니다." },
  { kind: "unauthorized", reproduce: "검증 API가 HTTP 401 반환", message: "API 인증에 실패했습니다." },
  { kind: "rate_limited", reproduce: "검증 API가 HTTP 429 반환", message: "API 호출 제한에 도달했습니다." },
  { kind: "offline", reproduce: "검증 API가 연결 끊김 응답 반환", message: "네트워크가 오프라인입니다." },
  { kind: "schema_changed", reproduce: "검증 API가 필수 필드 없는 JSON 반환", message: "위젯 응답 형식이 변경되었습니다." },
];

export function FailureVerification() {
  const baseline = verificationFixtures[2];
  const [activeKind, setActiveKind] = useState<VerificationKind>("timeout");
  const [hasLastGood, setHasLastGood] = useState(true);
  const [data, setData] = useState<WidgetPayload>(baseline.data);
  const [isRunning, setIsRunning] = useState(false);

  async function runScenario(kind: VerificationKind) {
    setActiveKind(kind);
    setIsRunning(true);
    try {
      await fetchWidgetPayload(`/api/verification/failure?kind=${kind}`, 300);
    } catch (error) {
      setData(displayPayloadAfterFailure(hasLastGood ? baseline.data : undefined, error, baseline.data.source));
    } finally {
      setIsRunning(false);
    }
  }

  async function recover() {
    setIsRunning(true);
    try {
      setData(await fetchWidgetPayload("/api/verification/failure?kind=recovery"));
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="failure-lab" aria-labelledby="failure-lab-heading">
      <div className="section-heading">
        <div><span>03</span><h2 id="failure-lab-heading">장애 5종 재현</h2></div>
        <p>검증 API 요청 · 정상값 보존 · 오래된 데이터 · 다시 시도</p>
      </div>
      <div className="failure-layout">
        <div>
          <div className="failure-controls" role="group" aria-label="장애 종류 선택">
            {FAILURE_SCENARIOS.map((item) => (
              <button
                key={item.kind}
                type="button"
                className={activeKind === item.kind && data.status !== "ok" ? "active" : ""}
                onClick={() => void runScenario(item.kind)}
                disabled={isRunning}
              >
                {FAILURE_LABELS[item.kind]}
              </button>
            ))}
          </div>
          <label className="failure-toggle">
            <input
              type="checkbox"
              checked={hasLastGood}
              onChange={(event) => setHasLastGood(event.target.checked)}
            />
            마지막 정상값 있음
          </label>
          <table className="failure-table">
            <thead><tr><th>장애</th><th>재현 방법</th><th>화면 문구</th><th>마지막 정상값</th><th>복구</th></tr></thead>
            <tbody>
              {FAILURE_SCENARIOS.map((item) => (
                <tr key={item.kind}>
                  <td>{FAILURE_LABELS[item.kind]}</td>
                  <td>{item.reproduce}</td>
                  <td>{item.message}</td>
                  <td>있으면 오래된 데이터, 없으면 빈 상태</td>
                  <td>검증 API 다시 시도</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <WidgetCard
          icon={baseline.icon}
          name={`${baseline.name} 장애 재현`}
          data={data}
          isRefreshing={isRunning}
          onRefresh={() => void recover()}
        />
      </div>
    </section>
  );
}
