import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAirKorea, fetchKmaWeather, kmaBaseTime, normalizeServiceKey } from "./data-go-kr";
import { fetchAirQuality, fetchWeather, pm25Grade, toKstIso } from "./open-meteo";

beforeEach(() => {
  delete process.env.DATA_GO_KR_SERVICE_KEY;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function stubFetch(body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
}

describe("무료 공개 API adapter", () => {

  it("Open-Meteo 날씨: KST 원천 시각과 수치 지표를 만든다", async () => {
    stubFetch({ current: { time: "2026-11-03T15:15", temperature_2m: 15.1, apparent_temperature: 14.2, relative_humidity_2m: 67, precipitation: 0, weather_code: 2, wind_speed_10m: 4.7 } });
    const result = await fetchWeather();
    expect(result.value?.headline).toBe("15.1°C");
    expect(result.value?.subline).toContain("구름 조금");
    expect(result.sourceTimestamp).toBe("2026-11-03T15:15:00+09:00");
    expect(result.value?.metric?.value).toBe(15.1);
  });

  it("Open-Meteo 대기질: PM2.5 한국 등급을 표시한다", async () => {
    stubFetch({ current: { time: "2026-11-03T15:00", pm10: 86.6, pm2_5: 44.1, us_aqi: 111 } });
    const result = await fetchAirQuality();
    expect(result.value?.subline).toContain("나쁨");
    expect(pm25Grade(15)).toBe("좋음");
    expect(pm25Grade(35)).toBe("보통");
    expect(pm25Grade(76)).toBe("매우 나쁨");
    expect(toKstIso("2026-11-03T15:00")).toBe("2026-11-03T15:00:00+09:00");
  });




});

describe("공공데이터포털 adapter", () => {
  it("키가 없으면 unauthorized로 구분하고 외부 호출을 하지 않는다", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await expect(fetchAirKorea()).rejects.toMatchObject({ kind: "unauthorized", status: 401 });
    await expect(fetchKmaWeather()).rejects.toMatchObject({ kind: "unauthorized" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("인코딩 키와 디코딩 키를 모두 허용한다", () => {
    expect(normalizeServiceKey("abc%2Bdef%3D%3D")).toBe("abc+def==");
    expect(normalizeServiceKey("abc+def==")).toBe("abc+def==");
  });

  it("HTTP 200 XML 인증 오류를 unauthorized로 분류한다", async () => {
    process.env.DATA_GO_KR_SERVICE_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<OpenAPI_ServiceResponse>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</OpenAPI_ServiceResponse>")));
    await expect(fetchAirKorea()).rejects.toMatchObject({ kind: "unauthorized" });
  });

  it("에어코리아: 내 시·도 측정소들의 PM2.5 평균과 가장 높은 곳을 계산한다", async () => {
    process.env.DATA_GO_KR_SERVICE_KEY = "k";
    const fetchSpy = vi.fn().mockResolvedValue(Response.json({ response: { header: { resultCode: "00" }, body: { items: [
      { stationName: "연산동", dataTime: "2026-11-03 15:00", pm10Value: "50", pm25Value: "30" },
      { stationName: "광안동", dataTime: "2026-11-03 14:00", pm10Value: "80", pm25Value: "40" },
      { stationName: "고장난곳", dataTime: "2026-11-03 15:00", pm10Value: "-", pm25Value: "-" },
    ] } } }));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await fetchAirKorea({ lat: 35.18, lon: 129.08, name: "부산 연산5동", sido: "부산" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain(`sidoName=${encodeURIComponent("부산")}`);
    expect(result.value?.headline).toBe("PM2.5 35 μg/m³");
    expect(result.value?.subline).toBe("부산 평균 · 측정소 2곳");
    expect(result.value?.details?.[1]?.value).toBe("광안동 40");
    expect(result.value?.metric?.key).toBe("airkorea-부산-pm25");
    expect(result.sourceTimestamp).toBe("2026-11-03T15:00:00+09:00");
    expect(result.source.endpointTemplate).not.toContain("k&");
  });

  it("에어코리아: 시·도를 모르는 위치(한국 밖)는 키 확인 전에 안내 오류를 낸다", async () => {
    await expect(fetchAirKorea({ lat: 35.68, lon: 139.69, name: "도쿄" })).rejects.toMatchObject({ status: 400 });
  });

  it("기상청: 한국 밖 위치는 호출하지 않고 안내 오류를 낸다", async () => {
    process.env.DATA_GO_KR_SERVICE_KEY = "k";
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await expect(fetchKmaWeather({ lat: 35.68, lon: 139.69, name: "도쿄" })).rejects.toMatchObject({ status: 400 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("기상청 초단기실황: 정시+10분 이전에는 직전 정시를 기준으로 한다", () => {
    expect(kmaBaseTime(new Date("2026-11-03T06:05:00Z"))).toEqual({ baseDate: "20261103", baseTime: "1400" });
    expect(kmaBaseTime(new Date("2026-11-03T06:30:00Z"))).toEqual({ baseDate: "20261103", baseTime: "1500" });
    expect(kmaBaseTime(new Date("2026-11-02T15:05:00Z"))).toEqual({ baseDate: "20261102", baseTime: "2300" });
  });

  it("기상청 초단기실황: 기온·습도·강수 형태를 정규화한다", async () => {
    process.env.DATA_GO_KR_SERVICE_KEY = "k";
    const fetchSpy = vi.fn().mockResolvedValue(Response.json({ response: { header: { resultCode: "00" }, body: { items: { item: [
      { category: "T1H", obsrValue: "12.4" }, { category: "REH", obsrValue: "55" },
      { category: "PTY", obsrValue: "1" }, { category: "RN1", obsrValue: "1.0" }, { category: "WSD", obsrValue: "2.1" },
    ] } } } }));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await fetchKmaWeather({ lat: 35.18, lon: 129.08, name: "부산", sido: "부산" }, new Date("2026-11-03T06:30:00Z"));
    expect(String(fetchSpy.mock.calls[0][0])).toContain("nx=98&ny=76"); // 부산 연산동 격자
    expect(result.value?.headline).toBe("12.4°C");
    expect(result.value?.subline).toBe("부산 · 비 (기상청 실황)");
    expect(result.value?.metric?.key).toBe("kma-temp@98,76");
    expect(result.value?.metric?.value).toBe(12.4);
  });
});
