import { afterEach, describe, expect, it, vi } from "vitest";
import { daysBetween, fetchKpIndex, fetchNextHoliday, fetchForecast } from "./forecast-extras";
import { kpGrade, pm25Grade, uvGrade } from "@/lib/air-grade";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
}

describe("일간 예보·공휴일·Kp adapter", () => {
  it("일간 예보: 최고/최저, 일출·일몰, 자외선, 강수확률을 정규화한다", async () => {
    stubFetch({
      daily: {
        time: ["2026-11-03", "2026-11-04", "2026-11-05"],
        sunrise: ["2026-11-03T06:58", "2026-11-04T06:59", "2026-11-05T07:00"],
        sunset: ["2026-11-03T17:32", "2026-11-04T17:31", "2026-11-05T17:30"],
        uv_index_max: [3.9, 3, 3.9],
        precipitation_probability_max: [60, 10, 0],
        temperature_2m_max: [15.4, 12, 11],
        temperature_2m_min: [6.1, 5, 4],
      },
    });
    const result = await fetchForecast();
    expect(result.value?.headline).toBe("15° / 6°");
    expect(result.value?.metric?.value).toBe(15.4);
    expect(result.value?.facts).toMatchObject({ precipProbability: 60, uvMax: 3.9 });
    expect(result.value?.details?.[0]?.value).toBe("06:58 / 17:32");
    expect(result.sourceTimestamp).toBe("2026-11-03T00:00:00+09:00");
  });

  it("일간 예보: 필수 배열이 없으면 schema_changed", async () => {
    stubFetch({ daily: { time: ["2026-11-03"] } });
    await expect(fetchForecast()).rejects.toMatchObject({ kind: "schema_changed" });
  });

  it("공휴일: KST 오늘 기준 D-day와 요일을 계산한다", async () => {
    stubFetch([
      { date: "2026-12-25", localName: "크리스마스", name: "Christmas Day" },
      { date: "2027-01-01", localName: "새해", name: "New Year's Day" },
    ]);
    const result = await fetchNextHoliday(new Date("2026-11-03T06:00:00Z"));
    expect(result.value?.headline).toBe("D-52");
    expect(result.value?.subline).toBe("크리스마스 · 2026-12-25 (금)");
    expect(result.value?.facts?.daysUntil).toBe(52);
  });

  it("공휴일: UTC 15시 이후는 이미 다음 KST 날짜로 계산한다", async () => {
    stubFetch([{ date: "2026-11-04", localName: "테스트", name: "Test" }]);
    expect((await fetchNextHoliday(new Date("2026-11-03T15:30:00Z"))).value?.headline).toBe("D-DAY");
    expect(daysBetween("2026-11-03", "2026-11-04")).toBe(1);
  });

  it("Kp: 가장 최신 관측값과 오늘 최대값을 표시한다", async () => {
    stubFetch([
      { time_tag: "2026-10-27T00:00:00", Kp: 1.67 },
      { time_tag: "2026-10-27T06:00:00", Kp: 5.33 },
      { time_tag: "2026-10-27T03:00:00", Kp: 2.67 },
      { time_tag: "2026-10-27T09:00:00", Kp: 3.33 },
    ]);
    const result = await fetchKpIndex();
    expect(result.value?.headline).toBe("Kp 3.33");
    expect(result.value?.details?.[0]?.value).toBe("5.33");
    expect(result.sourceTimestamp).toBe("2026-10-27T09:00:00Z");
    stubFetch([]);
    await expect(fetchKpIndex()).rejects.toMatchObject({ kind: "schema_changed" });
  });

  it("등급 함수는 경계값을 올바르게 나눈다", () => {
    expect(pm25Grade(35)).toBe("보통");
    expect(pm25Grade(35.1)).toBe("나쁨");
    expect(uvGrade(2.9)).toBe("낮음");
    expect(uvGrade(6)).toBe("높음");
    expect(uvGrade(11)).toBe("위험");
    expect(kpGrade(4)).toBe("활동적");
    expect(kpGrade(5)).toBe("지자기 폭풍");
  });
});
