import type {
  WidgetFailureKind,
  WidgetPayload,
  WidgetStatus,
} from "@/types/widget";

const VALID_STATUSES = new Set<WidgetStatus>([
  "ok",
  "refreshing",
  "stale",
  "maintenance",
  "rate_limited",
  "error",
]);

export const FAILURE_LABELS: Record<WidgetFailureKind, string> = {
  timeout: "응답 시간 초과",
  unauthorized: "인증 실패",
  rate_limited: "호출 제한",
  offline: "오프라인",
  schema_changed: "응답 형식 변경",
  provider_error: "공급자 조회 실패",
};

export class WidgetRequestError extends Error {
  constructor(
    public readonly kind: WidgetFailureKind,
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "WidgetRequestError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isWidgetPayload(value: unknown): value is WidgetPayload {
  if (!isObject(value) || !VALID_STATUSES.has(value.status as WidgetStatus)) return false;
  if (typeof value.fetchedAt !== "string" || typeof value.cacheAgeMs !== "number") return false;
  if (!isObject(value.source)) return false;
  if (
    typeof value.source.provider !== "string"
    || typeof value.source.docsUrl !== "string"
    || typeof value.source.endpointTemplate !== "string"
  ) return false;
  if (value.value !== null) {
    if (!isObject(value.value) || typeof value.value.headline !== "string") return false;
  }
  return true;
}

function kindFromStatus(status: number): WidgetFailureKind {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate_limited";
  return "provider_error";
}

export function normalizeWidgetError(error: unknown, isOnline = true): WidgetRequestError {
  if (error instanceof WidgetRequestError) return error;
  if (!isOnline) return new WidgetRequestError("offline", "네트워크가 오프라인입니다.");
  if (error instanceof Error && error.name === "AbortError") {
    return new WidgetRequestError("timeout", "요청 응답 시간이 초과되었습니다.");
  }
  if (error instanceof TypeError) {
    return new WidgetRequestError("timeout", "요청을 완료하지 못했습니다. 응답 시간 또는 연결 상태를 확인해 주세요.");
  }
  return new WidgetRequestError(
    "provider_error",
    error instanceof Error ? error.message : "알 수 없는 조회 오류입니다.",
  );
}

export async function fetchWidgetPayload(
  requestPath: string,
  timeoutMs = 8_000,
): Promise<WidgetPayload> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(requestPath, { signal: controller.signal });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new WidgetRequestError("schema_changed", "응답을 JSON 형식으로 읽을 수 없습니다.", response.status);
    }

    if (!response.ok) {
      const payload = isWidgetPayload(body) ? body : undefined;
      const kind = payload?.lastError?.kind ?? kindFromStatus(response.status);
      throw new WidgetRequestError(
        kind,
        payload?.lastError?.message ?? `자체 API가 HTTP ${response.status}을 반환했습니다.`,
        response.status,
      );
    }
    if (!isWidgetPayload(body)) {
      throw new WidgetRequestError("schema_changed", "위젯 응답 형식이 변경되었습니다.", response.status);
    }
    return body;
  } catch (error) {
    const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;
    throw normalizeWidgetError(error, isOnline);
  } finally {
    window.clearTimeout(timeout);
  }
}

export function displayPayloadAfterFailure(
  previous: WidgetPayload | undefined,
  error: unknown,
  source: WidgetPayload["source"],
): WidgetPayload {
  const normalized = normalizeWidgetError(
    error,
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const occurredAt = new Date().toISOString();
  const label = FAILURE_LABELS[normalized.kind];

  if (previous?.value) {
    return {
      ...previous,
      status: "stale",
      warning: `${label} — 최신 조회에 실패해 마지막 정상값을 표시합니다.`,
      lastError: {
        kind: normalized.kind,
        code: normalized.code,
        message: normalized.message,
        occurredAt,
      },
    };
  }

  return {
    value: null,
    status: normalized.kind === "rate_limited" ? "rate_limited" : "error",
    source,
    fetchedAt: "",
    cacheAgeMs: 0,
    warning: `${label} — 정상 조회 기록이 없어 빈 상태로 표시합니다.`,
    lastError: {
      kind: normalized.kind,
      code: normalized.code,
      message: normalized.message,
      occurredAt,
    },
  };
}
