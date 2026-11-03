import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PLACE, isInKorea, parsePlace, placeKey, placeQuery, shortSido, toKmaGrid } from "./location";
import { describePlace, resolvePlace } from "./providers/place";
import { fetchAirQuality, fetchWeather, formatOffset, toKstIso } from "./providers/open-meteo";
import { fetchSensorCommunity } from "./providers/sensor-community";

afterEach(() => vi.unstubAllGlobals());

const BUSAN = { lat: 35.18, lon: 129.08, name: "부산 연산5동", sido: "부산" } as const;
const TOKYO = { lat: 35.68, lon: 139.69, name: "도쿄" } as const;

describe("위치 파싱·변환", () => {
  it("쿼리가 없으면 서울 기본 위치, 있으면 소수 둘째 자리로 반올림한다", () => {
    expect(parsePlace(new URLSearchParams())).toEqual(DEFAULT_PLACE);
    const place = parsePlace(new URLSearchParams("lat=35.17961&lon=129.07564&place=부산 연산5동&sido=부산광역시"));
    expect(place).toEqual({ lat: 35.18, lon: 129.08, name: "부산 연산5동", sido: "부산" });
  });

  it("잘못된 좌표는 400, 이상한 지명은 '내 위치'로 대체한다", () => {
    expect(() => parsePlace(new URLSearchParams("lat=abc&lon=129"))).toThrowError(/올바르지 않습니다/);
    expect(() => parsePlace(new URLSearchParams("lat=95&lon=129"))).toThrowError();
    expect(() => parsePlace(new URLSearchParams("lat=35"))).toThrowError();
    expect(parsePlace(new URLSearchParams("lat=35&lon=129&place=<script>alert(1)</script>")).name).toBe("내 위치");
    expect(parsePlace(new URLSearchParams(`lat=35&lon=129&place=${"가".repeat(31)}`)).name).toBe("내 위치");
    expect(parsePlace(new URLSearchParams("lat=35&lon=129&sido=아무곳")).sido).toBeUndefined();
  });

  it("클라이언트 쿼리: 기본 위치면 비우고, 그 외엔 위치·지명·시도를 담는다", () => {
    expect(placeQuery(DEFAULT_PLACE)).toBe("");
    const params = new URLSearchParams(placeQuery(BUSAN));
    expect(params.get("lat")).toBe("35.18");
    expect(params.get("place")).toBe("부산 연산5동");
    expect(params.get("sido")).toBe("부산");
  });

  it("시·도 약칭과 한국 범위, 기록 키(약 10km 격자)", () => {
    expect(shortSido("부산광역시")).toBe("부산");
    expect(shortSido("충청북도")).toBe("충북");
    expect(shortSido("강원특별자치도")).toBe("강원");
    expect(shortSido("도쿄도")).toBeUndefined();
    expect(isInKorea(35.18, 129.08)).toBe(true);
    expect(isInKorea(35.68, 139.69)).toBe(false);
    expect(placeKey({ lat: 35.18, lon: 129.08, name: "a" })).toBe(placeKey({ lat: 35.21, lon: 129.06, name: "b" }));
    expect(placeKey(DEFAULT_PLACE)).not.toBe(placeKey(BUSAN));
  });

  it("기상청 격자 변환: 서울 시청 (60,127), 부산 (98,76), 제주시 (53,38)", () => {
    expect(toKmaGrid(37.5665, 126.978)).toEqual({ nx: 60, ny: 127 });
    expect(toKmaGrid(35.18, 129.08)).toEqual({ nx: 98, ny: 76 });
    expect(toKmaGrid(33.5, 126.53)).toEqual({ nx: 53, ny: 38 });
  });
});

describe("지명 조회", () => {
  it("한국 좌표는 시·도 약칭+동네, 해외는 도시명으로 만든다", () => {
    expect(describePlace({ countryCode: "KR", principalSubdivision: "부산광역시", city: "부산광역시", locality: "연산5동" }))
      .toEqual({ name: "부산 연산5동", sido: "부산", countryCode: "KR" });
    expect(describePlace({ countryCode: "KR", principalSubdivision: "서울특별시", city: "서울특별시", locality: "서울특별시" }).name).toBe("서울");
    expect(describePlace({ countryCode: "JP", city: "Tokyo", countryName: "일본" })).toMatchObject({ name: "Tokyo" });
  });

  it("조회 실패는 '내 위치'로 대체하고 캐시하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await resolvePlace(10.01, 10.01)).toEqual({ name: "내 위치" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ countryCode: "KR", principalSubdivision: "대구광역시", city: "대구광역시", locality: "수성동" })));
    expect((await resolvePlace(10.01, 10.01)).name).toBe("대구 수성동"); // 이전 실패가 캐시되지 않았다
  });
});

describe("위치 기반 어댑터", () => {
  it("날씨: 선택 위치 좌표로 호출하고 위치별 기록 키·이름·현지 오프셋을 쓴다", async () => {
    const spy = vi.fn().mockResolvedValue(Response.json({
      utc_offset_seconds: 32400,
      current: { time: "2026-11-03T16:00", temperature_2m: 17.7, apparent_temperature: 16, relative_humidity_2m: 60, precipitation: 0, weather_code: 0, wind_speed_10m: 3 },
    }));
    vi.stubGlobal("fetch", spy);
    const result = await fetchWeather(BUSAN);
    expect(String(spy.mock.calls[0][0])).toContain("latitude=35.18&longitude=129.08");
    expect(String(spy.mock.calls[0][0])).toContain("timezone=auto");
    expect(result.value?.subline).toBe("부산 연산5동 · 맑음");
    expect(result.value?.metric).toMatchObject({ key: "weather-temp@35.2,129.1", label: "부산 연산5동 기온" });
    expect(result.sourceTimestamp).toBe("2026-11-03T16:00:00+09:00");
  });

  it("날씨: 서울과 부산은 서로 다른 기록 키라 날짜별 기록이 섞이지 않는다", async () => {
    const body = { utc_offset_seconds: 32400, current: { time: "2026-11-03T16:00", temperature_2m: 10, apparent_temperature: 9, relative_humidity_2m: 50, precipitation: 0, weather_code: 1, wind_speed_10m: 1 } };
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json(body))));
    const seoul = await fetchWeather();
    const busan = await fetchWeather(BUSAN);
    expect(seoul.value?.metric?.key).not.toBe(busan.value?.metric?.key);
  });

  it("해외 위치는 응답의 UTC 오프셋으로 원천 시각을 표기한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      utc_offset_seconds: -18000,
      current: { time: "2026-11-03T02:00", pm10: 10, pm2_5: 5, us_aqi: 20 },
    })));
    const result = await fetchAirQuality({ lat: 40.71, lon: -74.01, name: "New York" });
    expect(result.sourceTimestamp).toBe("2026-11-03T02:00:00-05:00");
    expect(formatOffset(19800)).toBe("+05:30");
    expect(toKstIso("2026-11-03T15:15")).toBe("2026-11-03T15:15:00+09:00");
  });

  it("시민 센서: 선택 위치 중심 좌표로 조회하고 위치 이름을 표기한다", async () => {
    const spy = vi.fn().mockResolvedValue(Response.json([]));
    vi.stubGlobal("fetch", spy);
    const result = await fetchSensorCommunity(TOKYO);
    expect(String(spy.mock.calls[0][0])).toContain("area=35.68,139.69,50");
    expect(result.value?.subline).toContain("도쿄");
  });
});
