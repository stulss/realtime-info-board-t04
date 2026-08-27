import { describe, expect, it } from "vitest";
import type { WidgetPayload } from "@/types/widget";
import {
  WidgetRequestError,
  displayPayloadAfterFailure,
  isWidgetPayload,
  normalizeWidgetError,
} from "./widget-state";

const source: WidgetPayload["source"] = {
  provider: "테스트 공급자",
  docsUrl: "https://example.com/source",
  endpointTemplate: "GET /value",
};

const previous: WidgetPayload = {
  value: { headline: "100원", subline: "TEST / KRW" },
  status: "ok",
  source,
  sourceTimestamp: "2026-08-27T00:00:00.000Z",
  fetchedAt: "2026-08-27T00:00:01.000Z",
  cacheAgeMs: 0,
};

describe("widget-state", () => {
  it.each([
    ["timeout", "응답 시간 초과"],
    ["unauthorized", "인증 실패"],
    ["rate_limited", "호출 제한"],
    ["offline", "오프라인"],
    ["schema_changed", "응답 형식 변경"],
  ] as const)("%s 장애에서 마지막 정상값과 장애 종류를 보존한다", (kind, label) => {
    const result = displayPayloadAfterFailure(
      previous,
      new WidgetRequestError(kind, label, kind === "unauthorized" ? 401 : undefined),
      source,
    );

    expect(result.status).toBe("stale");
    expect(result.value?.headline).toBe("100원");
    expect(result.fetchedAt).toBe(previous.fetchedAt);
    expect(result.lastError).toMatchObject({ kind, message: label });
  });

  it("마지막 정상값이 없으면 값이 있는 것처럼 표시하지 않는다", () => {
    const result = displayPayloadAfterFailure(
      undefined,
      new WidgetRequestError("offline", "네트워크가 오프라인입니다."),
      source,
    );

    expect(result.value).toBeNull();
    expect(result.status).toBe("error");
    expect(result.fetchedAt).toBe("");
    expect(result.lastError?.kind).toBe("offline");
  });

  it("필수 필드가 빠진 성공 응답을 유효한 위젯으로 인정하지 않는다", () => {
    expect(isWidgetPayload(previous)).toBe(true);
    expect(isWidgetPayload({ value: { headline: "100원" }, status: "ok" })).toBe(false);
  });

  it("브라우저 오프라인과 온라인 요청 실패를 서로 다르게 분류한다", () => {
    expect(normalizeWidgetError(new TypeError("Failed to fetch"), false).kind).toBe("offline");
    expect(normalizeWidgetError(new TypeError("Failed to fetch"), true).kind).toBe("timeout");
  });
});
