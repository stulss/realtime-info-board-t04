import type { WidgetPayload } from "@/types/widget";
import { ProviderHttpError } from "./http";

type CacheEntry = { data: WidgetPayload; storedAt: number; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<WidgetPayload>>();

function withCacheAge(data: WidgetPayload, storedAt: number): WidgetPayload {
  return { ...data, cacheAgeMs: Math.max(0, Date.now() - storedAt) };
}

export async function getCachedWidget(
  key: string,
  ttlMs: number,
  loader: () => Promise<WidgetPayload>,
): Promise<WidgetPayload> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return withCacheAge(cached.data, cached.storedAt);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = loader()
    .then((data) => {
      const storedAt = Date.now();
      cache.set(key, { data, storedAt, expiresAt: storedAt + ttlMs });
      return withCacheAge(data, storedAt);
    })
    .catch((error: unknown) => {
      if (!cached) throw error;
      const occurredAt = new Date().toISOString();
      const providerError = error instanceof ProviderHttpError ? error : undefined;
      return {
        ...withCacheAge(cached.data, cached.storedAt),
        status: "stale" as const,
        warning: "최신 조회에 실패해 마지막 성공값을 표시합니다.",
        lastError: {
          kind: providerError?.kind,
          code: providerError?.status,
          message: error instanceof Error ? error.message : "알 수 없는 조회 오류",
          occurredAt,
        },
      };
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, request);
  return request;
}

export function clearWidgetCache(): void {
  cache.clear();
  inFlight.clear();
}
