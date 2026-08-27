import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGithubStatus } from "./github-status";
import { fetchUpbitDailyHistory, fetchUpbitTicker } from "./upbit";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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

  it("Upbit 실제 일봉을 서로 다른 KST 날짜 기록으로 정규화한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T03:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([
      {
        market: "KRW-BTC",
        candle_date_time_utc: "2026-08-27T00:00:00",
        candle_date_time_kst: "2026-08-27T09:00:00",
        trade_price: 110_000_000,
        timestamp: 1_788_000_000_000,
      },
      {
        market: "KRW-BTC",
        candle_date_time_utc: "2026-08-26T00:00:00",
        candle_date_time_kst: "2026-08-26T09:00:00",
        trade_price: 100_000_000,
        timestamp: 1_787_913_600_000,
      },
      {
        market: "KRW-BTC",
        candle_date_time_utc: "2026-08-25T00:00:00",
        candle_date_time_kst: "2026-08-25T09:00:00",
        trade_price: 99_000_000,
        timestamp: 1_787_827_200_000,
      },
    ])));

    const result = await fetchUpbitDailyHistory();
    expect(result.timezone).toBe("Asia/Seoul");
    expect(result.records.map((item) => item.date)).toEqual(["2026-08-26", "2026-08-25"]);
    expect(result.records[0].unit).toBe("KRW");
    expect(result.source.url).not.toMatch(/key|token|authorization/i);
    expect(result.source.url).toContain("count=3");
  });

  it("정상 JSON이지만 Upbit 필드가 바뀌면 스키마 변경으로 분류한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([{ changed: true }])));
    await expect(fetchUpbitTicker()).rejects.toMatchObject({ kind: "schema_changed" });
  });

  it("GitHub Status 필수 필드가 없으면 스키마 변경으로 분류한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: {} })));
    await expect(fetchGithubStatus()).rejects.toMatchObject({ kind: "schema_changed" });
  });
});
