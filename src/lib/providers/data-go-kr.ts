import type { WidgetPayload } from "@/types/widget";
import { ProviderHttpError } from "@/lib/server/http";

/** 서울 중구 기상청 격자 좌표 */
const KMA_NX = 60;
const KMA_NY = 127;

export const airKoreaSource: WidgetPayload["source"] = {
  provider: "에어코리아(한국환경공단)",
  docsUrl: "https://www.data.go.kr/data/15073861/openapi.do",
  endpointTemplate: "GET /B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?serviceKey={REDACTED}&sidoName=서울",
  attribution: "공공데이터포털 · 한국환경공단 에어코리아 대기오염정보",
};

export const kmaSource: WidgetPayload["source"] = {
  provider: "기상청 단기예보(초단기실황)",
  docsUrl: "https://www.data.go.kr/data/15084084/openapi.do",
  endpointTemplate: "GET /1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey={REDACTED}&nx=60&ny=127",
  attribution: "공공데이터포털 · 기상청 단기예보 조회서비스",
};

/** 공공데이터포털 일반(Decoding) 키 또는 인코딩 키 모두 허용한다. */
export function normalizeServiceKey(raw: string): string {
  return /%[0-9A-Fa-f]{2}/.test(raw) ? decodeURIComponent(raw) : raw;
}

function requireKey(): string {
  const raw = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  if (!raw) {
    throw new ProviderHttpError(
      "DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다. 공공데이터포털 활용신청 후 서버 환경변수로 등록해 주세요.",
      401,
    );
  }
  return normalizeServiceKey(raw);
}

type DataGoKrEnvelope<T> = {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { items?: T };
  };
};

async function fetchDataGoKr<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new ProviderHttpError(
      timedOut ? "공공데이터포털 응답 시간이 초과되었습니다." : "공공데이터포털에 연결할 수 없습니다.",
      undefined,
      undefined,
      timedOut ? "timeout" : "offline",
    );
  }
  if (response.status === 429) throw new ProviderHttpError("공공데이터포털 호출 한도를 초과했습니다.", 429);
  const text = await response.text();
  let body: DataGoKrEnvelope<T>;
  try {
    body = JSON.parse(text) as DataGoKrEnvelope<T>;
  } catch {
    // 인증 오류는 HTTP 200 + XML로 내려오는 경우가 많다.
    if (/SERVICE[_ ]KEY|ACCESS[_ ]DENIED|UNREGISTERED/i.test(text)) {
      throw new ProviderHttpError("공공데이터포털 인증키가 등록되지 않았거나 활용신청이 승인되지 않았습니다.", 401);
    }
    throw new ProviderHttpError("공공데이터포털 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  const code = body.response?.header?.resultCode;
  if (code === "30" || code === "31" || code === "32") {
    throw new ProviderHttpError("공공데이터포털 인증키 오류입니다.", 401);
  }
  if (code === "22") throw new ProviderHttpError("공공데이터포털 일일 호출 한도를 초과했습니다.", 429);
  if (code !== "00" || !body.response?.body?.items) {
    throw new ProviderHttpError(
      body.response?.header?.resultMsg ?? "공공데이터포털 응답 형식이 변경되었습니다.",
      undefined,
      undefined,
      code ? "provider_error" : "schema_changed",
    );
  }
  return body.response.body.items;
}

type AirItem = {
  stationName: string;
  dataTime: string;
  pm10Value: string;
  pm25Value: string;
  khaiGrade?: string;
};

const KHAI_GRADE: Record<string, string> = { "1": "좋음", "2": "보통", "3": "나쁨", "4": "매우 나쁨" };

export async function fetchAirKorea(station = process.env.AIRKOREA_STATION?.trim() || "중구"): Promise<WidgetPayload> {
  const key = requireKey();
  const url = "http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty"
    + `?serviceKey=${encodeURIComponent(key)}&returnType=json&numOfRows=100&pageNo=1&sidoName=${encodeURIComponent("서울")}&ver=1.0`;
  const items = await fetchDataGoKr<AirItem[]>(url);
  const item = Array.isArray(items) ? items.find((entry) => entry.stationName === station) : undefined;
  const pm25 = Number(item?.pm25Value);
  const pm10 = Number(item?.pm10Value);
  if (!item || !Number.isFinite(pm25)) {
    throw new ProviderHttpError(`에어코리아에서 '${station}' 측정소의 PM2.5 값을 찾지 못했습니다.`, 503);
  }
  return {
    value: {
      headline: `PM2.5 ${pm25} μg/m³`,
      subline: `서울 ${station} 측정소 · ${KHAI_GRADE[item.khaiGrade ?? ""] ?? "통합대기 등급 정보 없음"}`,
      metric: { key: `airkorea-${station}-pm25`, label: `에어코리아 ${station} PM2.5`, value: pm25, unit: "μg/m³" },
      details: [{ label: "PM10", value: Number.isFinite(pm10) ? `${pm10} μg/m³` : "측정값 없음" }],
    },
    status: "ok",
    source: airKoreaSource,
    sourceTimestamp: `${item.dataTime.replace(" ", "T")}:00+09:00`,
    fetchedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    cacheAgeMs: 0,
  };
}

type KmaItem = { category: string; obsrValue: string; baseDate: string; baseTime: string };

/** 초단기실황은 정시 생성 후 약 10분 뒤부터 조회 가능하므로 그 전에는 직전 정시를 사용한다. */
export function kmaBaseTime(now = new Date()): { baseDate: string; baseTime: string } {
  const kst = new Date(now.getTime() + 9 * 3_600_000 - (now.getUTCMinutes() < 10 ? 3_600_000 : 0));
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    baseDate: `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`,
    baseTime: `${pad(kst.getUTCHours())}00`,
  };
}

const PTY: Record<string, string> = { "0": "강수 없음", "1": "비", "2": "비/눈", "3": "눈", "5": "빗방울", "6": "빗방울/눈날림", "7": "눈날림" };

export async function fetchKmaWeather(now = new Date()): Promise<WidgetPayload> {
  const key = requireKey();
  const { baseDate, baseTime } = kmaBaseTime(now);
  const url = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst"
    + `?serviceKey=${encodeURIComponent(key)}&pageNo=1&numOfRows=10&dataType=JSON`
    + `&base_date=${baseDate}&base_time=${baseTime}&nx=${KMA_NX}&ny=${KMA_NY}`;
  const items = await fetchDataGoKr<{ item: KmaItem[] }>(url);
  const list = items.item;
  const value = (category: string) => Number(list?.find((entry) => entry.category === category)?.obsrValue);
  const temp = value("T1H");
  if (!Array.isArray(list) || !Number.isFinite(temp)) {
    throw new ProviderHttpError("기상청 초단기실황 응답 형식이 변경되었습니다.", undefined, undefined, "schema_changed");
  }
  const rain = list.find((entry) => entry.category === "PTY")?.obsrValue ?? "0";
  return {
    value: {
      headline: `${temp.toFixed(1)}°C`,
      subline: `서울 중구 · ${PTY[rain] ?? "강수 형태 미확인"} (기상청 실황)`,
      metric: { key: "kma-seoul-temp", label: "기상청 서울 기온", value: temp, unit: "°C" },
      details: [
        { label: "습도", value: `${value("REH")}%` },
        { label: "1시간 강수", value: String(list.find((entry) => entry.category === "RN1")?.obsrValue ?? "-") },
        { label: "풍속", value: `${value("WSD")}m/s` },
      ],
    },
    status: "ok",
    source: kmaSource,
    sourceTimestamp: `${baseDate.slice(0, 4)}-${baseDate.slice(4, 6)}-${baseDate.slice(6, 8)}T${baseTime.slice(0, 2)}:00:00+09:00`,
    fetchedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    cacheAgeMs: 0,
  };
}
