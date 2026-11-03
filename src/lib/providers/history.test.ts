import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, daysBetweenDates, resolveRange, upbitDailyCount } from "@/lib/history/range";
import { applyDailyCloses } from "@/lib/history/daily-log";
import { airQualityHistory, buildHistory, getHistory, weatherHistory } from "./history";

afterEach(() => vi.unstubAllGlobals());

const NOW = new Date("2026-11-03T04:00:00.000Z"); // KST 2026-11-03 13:00
const BUSAN = { lat: 35.18, lon: 129.08, name: "부산", sido: "부산" } as const;

describe("기록 범위", () => {
  it("시작일은 2026-08-01, 끝은 어제(KST)이며 잘못된 입력은 기본값으로 되돌린다", () => {
    expect(resolveRange(null, NOW)).toEqual({ from: "2026-08-01", to: "2026-11-02" });
    expect(resolveRange("not-a-date", NOW).from).toBe("2026-08-01");
    expect(resolveRange("2026-10-20", NOW)).toEqual({ from: "2026-10-20", to: "2026-11-02" });
    expect(resolveRange("2030-01-01", NOW).from).toBe("2026-11-02"); // 미래는 어제로 제한
    expect(resolveRange("2001-01-01", NOW).from).toBe(addDays("2026-11-03", -366)); // 보관 한도
  });

  it("날짜 계산과 Upbit 요청 개수(시작일~오늘, 상한 200)", () => {
    expect(daysBetweenDates("2026-08-01", "2026-11-03")).toBe(94);
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(upbitDailyCount(NOW)).toBe(95);
    expect(upbitDailyCount(new Date("2027-12-01T00:00:00Z"))).toBe(200);
  });
});

describe("과거 원자료 → 하루 한 줄", () => {
  it("기온: 일 평균·최저·최고를 위치별 키로 만들고 값이 없는 날은 건너뛴다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ daily: {
      time: ["2026-08-01", "2026-08-02", "2026-08-03"],
      temperature_2m_mean: [27.44, null, 26],
      temperature_2m_max: [31, null, 30],
      temperature_2m_min: [24, null, 23],
    } })));
    const points = await weatherHistory(BUSAN, "2026-08-01", "2026-08-03");
    const temp = points.filter((point) => point.metricKey === "weather-temp@35.2,129.1");
    expect(temp.map((point) => [point.date, point.value, point.min, point.max])).toEqual([
      ["2026-08-01", 27.4, 24, 31], ["2026-08-03", 26, 23, 30],
    ]);
    expect(points.filter((point) => point.metricKey === "forecast-tmax@35.2,129.1")).toHaveLength(2);
  });

  it("PM2.5: 시간별 값을 일별 평균·최소·최대로 집계하고 절반 미만인 날은 제외한다", async () => {
    const day1 = Array.from({ length: 24 }, (_, hour) => ({ time: `2026-08-01T${String(hour).padStart(2, "0")}:00`, value: hour < 12 ? 10 : 30 }));
    const day2 = Array.from({ length: 5 }, (_, hour) => ({ time: `2026-08-02T${String(hour).padStart(2, "0")}:00`, value: 50 }));
    const rows = [...day1, ...day2];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ hourly: { time: rows.map((row) => row.time), pm2_5: rows.map((row) => row.value) } })));
    const points = await airQualityHistory(BUSAN, "2026-08-01", "2026-08-02");
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ date: "2026-08-01", value: 20, min: 10, max: 30, unit: "μg/m³" });
  });





  const weatherBody = { daily: { time: ["2026-08-01", "2026-08-02"], temperature_2m_mean: [20, 21], temperature_2m_max: [25, 26], temperature_2m_min: [15, 16] } };
  const airBody = {
    hourly: {
      time: Array.from({ length: 24 }, (_, hour) => `2026-08-01T${String(hour).padStart(2, "0")}:00`),
      pm2_5: Array.from({ length: 24 }, () => 20),
    },
  };
  const byUrl = (handlers: { weather?: () => Response; air?: () => Response }) => vi.fn().mockImplementation((url: string) => {
    if (String(url).includes("historical-forecast") && handlers.weather) return Promise.resolve(handlers.weather());
    if (String(url).includes("air-quality") && handlers.air) return Promise.resolve(handlers.air());
    return Promise.resolve(new Response("boom", { status: 500 }));
  });

  it("일부 출처가 실패해도 나머지로 응답하고 실패 이유를 sources에 남긴다", async () => {
    vi.stubGlobal("fetch", byUrl({ weather: () => Response.json(weatherBody) })); // 대기질은 500
    const result = await buildHistory(BUSAN, null, NOW);
    expect(result.points.filter((point) => point.metricKey === "weather-temp@35.2,129.1")).toHaveLength(2);
    expect(result.sources.filter((source) => source.ok).map((source) => source.name)).toEqual(["Open-Meteo 기온"]);
    const failed = result.sources.filter((source) => !source.ok);
    expect(failed.map((source) => source.name)).toEqual(["Open-Meteo 대기질"]);
    expect(failed[0].error).toBeTruthy();
  });

  it("전부 실패한 응답은 캐시하지 않고, 성공한 응답은 같은 조건에서 재사용한다", async () => {
    const failing = byUrl({});
    vi.stubGlobal("fetch", failing);
    const place = { lat: 1.1, lon: 1.1, name: "캐시실패" };
    await getHistory(place, null, NOW);
    const callsAfterFail = failing.mock.calls.length;
    await getHistory(place, null, NOW);
    expect(failing.mock.calls.length).toBeGreaterThan(callsAfterFail); // 다시 시도했다

    const ok = byUrl({ weather: () => Response.json(weatherBody), air: () => Response.json(airBody) });
    vi.stubGlobal("fetch", ok);
    const placeOk = { lat: 2.2, lon: 2.2, name: "캐시성공" };
    await getHistory(placeOk, null, NOW);
    const callsAfterOk = ok.mock.calls.length;
    await getHistory(placeOk, null, NOW);
    expect(ok.mock.calls.length).toBe(callsAfterOk); // 캐시 적중
  });
});

describe("기록에 채우기", () => {
  it("공급자가 준 최소·최대를 그대로 기록하고 같은 값으로 다시 채우면 저장하지 않는다", () => {
    const close = { metricKey: "w", label: "기온", unit: "°C", date: "2026-08-01", value: 27, min: 24, max: 31, sourceTimestamp: "2026-08-01T00:00:00.000Z", fetchedAt: "2026-11-03T00:00:00.000Z" };
    const once = applyDailyCloses([], [close], NOW);
    expect(once[0]).toMatchObject({ latest: 27, min: 24, max: 31, closed: true });
    expect(applyDailyCloses(once, [close], NOW)).toBe(once);
  });

  it("8월 1일부터 오늘 직전까지 날짜가 이어지고 오늘 실시간 기록은 별도 한 줄이다", () => {
    const closes = Array.from({ length: 94 }, (_, index) => ({
      metricKey: "w", label: "기온", unit: "°C", date: addDays("2026-08-01", index), value: index,
      sourceTimestamp: "x", fetchedAt: "2026-11-03T00:00:00.000Z",
    }));
    const filled = applyDailyCloses([], closes, NOW);
    expect(filled).toHaveLength(94);
    expect(filled[filled.length - 1].date).toBe("2026-08-01");
    expect(filled[0].date).toBe("2026-11-02");
  });
});
