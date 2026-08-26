import { NextResponse } from "next/server";
import type { WidgetPayload, WidgetStatus } from "@/types/widget";
import { ProviderHttpError } from "./http";

type Source = WidgetPayload["source"];

function statusFromError(error: unknown): WidgetStatus {
  if (!(error instanceof ProviderHttpError)) return "error";
  if (error.status === 429) return "rate_limited";
  if (error.status === 503) return "maintenance";
  return "error";
}

export async function widgetResponse(
  source: Source,
  loader: () => Promise<WidgetPayload>,
  refreshIntervalMs: number,
) {
  try {
    return NextResponse.json(await loader(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const occurredAt = new Date().toISOString();
    const providerError = error instanceof ProviderHttpError ? error : undefined;
    const retryDelay = providerError?.retryAfterMs ?? refreshIntervalMs;
    const payload: WidgetPayload = {
      value: null,
      status: statusFromError(error),
      source,
      fetchedAt: occurredAt,
      nextRefreshAt: new Date(Date.now() + retryDelay).toISOString(),
      cacheAgeMs: 0,
      warning: providerError?.status === 503 ? "공급자 API 접근 불가 상태입니다. 실제 서비스 장애를 의미하지는 않습니다." : undefined,
      lastError: {
        code: providerError?.status,
        message: error instanceof Error ? error.message : "알 수 없는 조회 오류",
        occurredAt,
      },
    };
    return NextResponse.json(payload, { status: providerError?.status === 429 ? 429 : 503 });
  }
}
