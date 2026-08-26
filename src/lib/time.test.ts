import { describe, expect, it } from "vitest";
import { formatAbsoluteTime, formatCountdown, formatRelativeTime } from "./time";

describe("time formatters", () => {
  it("원천 시각이 없으면 API 미제공을 반환한다", () => {
    expect(formatRelativeTime()).toBe("API 미제공");
  });

  it("절대 시각을 한국형 표시로 변환한다", () => {
    expect(formatAbsoluteTime("2026-08-26T12:30:00.000Z")).toMatch(/2026\.08\.26/);
  });

  it("다음 갱신까지 남은 시간을 계산한다", () => {
    expect(formatCountdown("2026-08-26T12:31:05.000Z", new Date("2026-08-26T12:30:00.000Z").getTime())).toBe("1분 5초 후");
  });
});
