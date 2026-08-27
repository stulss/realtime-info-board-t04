import { NextRequest, NextResponse } from "next/server";
import type { WidgetFailureKind, WidgetPayload } from "@/types/widget";

const SOURCE: WidgetPayload["source"] = {
  provider: "T04 검증 API",
  docsUrl: "/verification",
  endpointTemplate: "GET /api/verification/failure?kind={FAILURE_KIND}",
};

const KINDS = new Set<WidgetFailureKind>([
  "timeout",
  "unauthorized",
  "rate_limited",
  "offline",
  "schema_changed",
]);

function normalPayload(): WidgetPayload {
  const fetchedAt = new Date().toISOString();
  return {
    value: { headline: "검증 API 정상", subline: "다시 시도 복구 완료" },
    status: "ok",
    source: SOURCE,
    sourceTimestamp: fetchedAt,
    fetchedAt,
    cacheAgeMs: 0,
  };
}

export async function GET(request: NextRequest) {
  const requestedKind = request.nextUrl.searchParams.get("kind");
  if (requestedKind === "recovery") {
    return NextResponse.json(normalPayload(), { headers: { "Cache-Control": "no-store" } });
  }
  if (!requestedKind || !KINDS.has(requestedKind as WidgetFailureKind)) {
    return NextResponse.json({ error: "지원하지 않는 검증 장애입니다." }, { status: 400 });
  }

  const kind = requestedKind as WidgetFailureKind;
  if (kind === "timeout") {
    await new Promise((resolve) => setTimeout(resolve, 750));
    return NextResponse.json(normalPayload(), { headers: { "Cache-Control": "no-store" } });
  }
  if (kind === "schema_changed") {
    return NextResponse.json({ changed: true }, { headers: { "Cache-Control": "no-store" } });
  }

  const status = kind === "unauthorized" ? 401 : kind === "rate_limited" ? 429 : 503;
  const occurredAt = new Date().toISOString();
  const payload: WidgetPayload = {
    value: null,
    status: kind === "rate_limited" ? "rate_limited" : "error",
    source: SOURCE,
    fetchedAt: occurredAt,
    cacheAgeMs: 0,
    lastError: { kind, code: status, message: `${kind} 검증 응답`, occurredAt },
  };
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}
