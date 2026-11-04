import { describe, expect, it } from "vitest";
import { SKY_MOOD, skyKind, weatherLabel } from "./sky";

describe("하늘 장면 결정", () => {
  it("낮/밤 기본 그라디언트와 날씨 효과를 구분한다", () => {
    expect(skyKind(0, true)).toBe("clear-day");
    expect(skyKind(0, false)).toBe("clear-night");
    expect(skyKind(2, true)).toBe("clear-day"); // 구름 조금은 맑음 계열
    expect(skyKind(3, true)).toBe("cloudy");
    expect(skyKind(3, false)).toBe("cloudy");
  });

  it("비·눈·안개·뇌우 코드를 올바른 장면으로 묶는다", () => {
    expect([51, 61, 65, 67, 80, 82].map((code) => skyKind(code, true))).toEqual(Array(6).fill("rain"));
    expect([71, 75, 77, 85, 86].map((code) => skyKind(code, false))).toEqual(Array(5).fill("snow"));
    expect([45, 48].map((code) => skyKind(code, true))).toEqual(["fog", "fog"]);
    expect([95, 96, 99].map((code) => skyKind(code, true))).toEqual(["storm", "storm", "storm"]);
  });

  it("코드가 없으면 낮/밤만으로 정하고, 모든 장면에 문구가 있다", () => {
    expect(skyKind(undefined, true)).toBe("clear-day");
    expect(Object.keys(SKY_MOOD)).toHaveLength(7);
    expect(weatherLabel(63)).toBe("비");
    expect(weatherLabel(undefined)).toBe("날씨 확인 중");
    expect(weatherLabel(123)).toBe("날씨 코드 123");
  });
});
