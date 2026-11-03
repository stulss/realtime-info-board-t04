import { afterEach, describe, expect, it, vi } from "vitest";
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
    expect(result.source.url).toContain("count=27"); // 시작일(08-01)~2026-08-27
  });

  it("Upbit 완료 일봉은 2건으로 제한하지 않고 오늘(진행 중) 봉만 제외해 모두 돌려준다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T03:00:00.000Z"));
    const day = (date: string, price: number) => ({
      market: "KRW-BTC", candle_date_time_utc: `${date}T00:00:00`, candle_date_time_kst: `${date}T09:00:00`,
      trade_price: price, timestamp: 1_788_000_000_000,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([
      day("2026-08-27", 9), day("2026-08-26", 8), day("2026-08-25", 7), day("2026-08-24", 6), day("2026-08-23", 5), day("2026-08-22", 4),
    ])));
    const result = await fetchUpbitDailyHistory();
    expect(result.records.map((item) => item.date)).toEqual(["2026-08-26", "2026-08-25", "2026-08-24", "2026-08-23", "2026-08-22"]);
    expect(new Set(result.records.map((item) => item.id)).size).toBe(5);
  });

  it("완료 일봉이 하나도 없으면 503으로 구분한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T03:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([{
      market: "KRW-BTC", candle_date_time_utc: "2026-08-27T00:00:00", candle_date_time_kst: "2026-08-27T09:00:00", trade_price: 1, timestamp: 1,
    }])));
    await expect(fetchUpbitDailyHistory()).rejects.toMatchObject({ status: 503 });
  });

  it("정상 JSON이지만 Upbit 필드가 바뀌면 스키마 변경으로 분류한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([{ changed: true }])));
    await expect(fetchUpbitTicker()).rejects.toMatchObject({ kind: "schema_changed" });
  });

});
