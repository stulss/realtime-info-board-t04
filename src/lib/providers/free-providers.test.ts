import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCoingeckoPrices } from "./coingecko";
import { fetchAirKorea, fetchKmaWeather, kmaBaseTime, normalizeServiceKey } from "./data-go-kr";
import { fetchFrankfurterUsdKrw } from "./frankfurter";
import { fetchIssPosition } from "./iss";
import { fetchAirQuality, fetchWeather, pm25Grade, toKstIso } from "./open-meteo";
import { fetchSensorCommunity } from "./sensor-community";
import { fetchUsgsEarthquakes } from "./usgs";

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
  it("USGS: 최대 규모와 24시간 건수를 정규화한다", async () => {
    stubFetch({
      metadata: { generated: 1_793_686_620_000, count: 2 },
      features: [
        { properties: { mag: 3.1, place: "A", time: 1_793_680_000_000 } },
        { properties: { mag: 5.4, place: "Tokyo, Japan", time: 1_793_681_000_000 } },
        { properties: { mag: null, place: "B", time: 1 } },
      ],
    });
    const result = await fetchUsgsEarthquakes();
    expect(result.value?.headline).toBe("최대 M5.4");
    expect(result.value?.metric).toMatchObject({ value: 2, unit: "건" });
  });

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

  it("Frankfurter: 응답 형식이 바뀌면 schema_changed", async () => {
    stubFetch({ date: "2026-11-03", rate: 1339.73, base: "USD", quote: "KRW" });
    expect((await fetchFrankfurterUsdKrw()).value?.metric?.value).toBe(1339.73);
    stubFetch({ unexpected: true });
    await expect(fetchFrankfurterUsdKrw()).rejects.toMatchObject({ kind: "schema_changed" });
  });

  it("CoinGecko: ETH를 헤드라인, BTC를 상세로 표시한다", async () => {
    stubFetch({ bitcoin: { usd: 76377, usd_24h_change: -2.3 }, ethereum: { usd: 2242.14, usd_24h_change: -1.9, last_updated_at: 1_793_686_620 } });
    const result = await fetchCoingeckoPrices();
    expect(result.value?.headline).toBe("$2,242.14");
    expect(result.value?.trend).toBe("down");
    expect(result.value?.details?.[1]?.value).toBe("$76,377.00");
  });

  it("ISS: 문자열 좌표를 방위 표기로 바꾼다", async () => {
    stubFetch({ iss_position: { latitude: "-21.8385", longitude: "174.5260" }, timestamp: 1_793_686_651 });
    expect((await fetchIssPosition()).value?.headline).toBe("21.84°S, 174.53°E");
  });

  it("Sensor.Community: 센서가 없으면 빈 상태 문구, 있으면 평균과 지표를 만든다", async () => {
    stubFetch([]);
    const empty = await fetchSensorCommunity();
    expect(empty.value?.headline).toBe("주변 센서 없음");
    expect(empty.value?.metric).toBeUndefined();

    stubFetch([
      { timestamp: "2026-11-03 06:00:00", sensordatavalues: [{ value_type: "P1", value: "30" }, { value_type: "P2", value: "10" }] },
      { timestamp: "2026-11-03 06:01:00", sensordatavalues: [{ value_type: "P2", value: "20" }] },
    ]);
    const result = await fetchSensorCommunity();
    expect(result.value?.metric?.value).toBe(15);
    expect(result.sourceTimestamp).toBe("2026-11-03T06:01:00Z");
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
