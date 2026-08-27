import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetPayload } from "@/types/widget";
import { clearWidgetCache, getCachedWidget } from "./cache";
import { ProviderHttpError } from "./http";

const payload: WidgetPayload = {
  value: { headline: "실제 값" },
  status: "ok",
  source: { provider: "Test", docsUrl: "https://example.com", endpointTemplate: "GET /value" },
  fetchedAt: "2026-08-26T00:00:00.000Z",
  cacheAgeMs: 0,
};

beforeEach(() => {
  clearWidgetCache();
  vi.restoreAllMocks();
});

describe("getCachedWidget", () => {
  it("동일 키의 동시 요청은 하나의 promise를 공유한다", async () => {
    let resolveLoader: ((value: WidgetPayload) => void) | undefined;
    const loader = vi.fn(() => new Promise<WidgetPayload>((resolve) => { resolveLoader = resolve; }));
    const first = getCachedWidget("same", 1_000, loader);
    const second = getCachedWidget("same", 1_000, loader);
    resolveLoader?.(payload);

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("갱신 실패 시 마지막 성공값을 stale 상태로 유지한다", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    await getCachedWidget("stale", 100, async () => payload);
    now.mockReturnValue(2_000);

    const stale = await getCachedWidget("stale", 100, async () => { throw new Error("network down"); });
    expect(stale.value?.headline).toBe("실제 값");
    expect(stale.status).toBe("stale");
    expect(stale.lastError?.message).toBe("network down");
  });

  it("갱신 실패의 장애 종류를 stale 응답에 보존한다", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    await getCachedWidget("kind", 100, async () => payload);
    now.mockReturnValue(2_000);

    const stale = await getCachedWidget("kind", 100, async () => {
      throw new ProviderHttpError("limited", 429, undefined, "rate_limited");
    });
    expect(stale.lastError?.kind).toBe("rate_limited");
  });
});
