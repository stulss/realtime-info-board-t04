import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGithubStatus } from "./github-status";
import { fetchUpbitTicker } from "./upbit";

afterEach(() => vi.unstubAllGlobals());

describe("public provider adapters", () => {
  it("Upbit 응답을 공통 WidgetData 계약으로 정규화한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([
      { trade_price: 100_000_000, signed_change_rate: 0.0123, timestamp: 1_788_000_000_000 },
    ])));
    const result = await fetchUpbitTicker();
    expect(result.status).toBe("ok");
    expect(result.value?.subline).toBe("BTC / KRW");
    expect(result.sourceTimestamp).toBeDefined();
    expect(result.source.endpointTemplate).not.toContain("key");
  });

  it("GitHub 상태 응답에서 영향받는 구성요소를 계산한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      page: { updated_at: "2026-08-26T00:00:00.000Z" },
      status: { indicator: "minor", description: "Minor Service Outage" },
      components: [{ status: "operational" }, { status: "degraded_performance" }],
    })));
    const result = await fetchGithubStatus();
    expect(result.value?.headline).toBe("일부 기능 성능 저하");
    expect(result.value?.details?.[0]?.value).toBe("1개");
  });
});
