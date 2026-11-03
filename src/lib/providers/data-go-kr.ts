import type { WidgetPayload } from "@/types/widget";
import { ProviderHttpError } from "@/lib/server/http";
import { DEFAULT_PLACE, isInKorea, toKmaGrid, type Place } from "@/lib/location";

export const airKoreaSource: WidgetPayload["source"] = {
  provider: "에어코리아(한국환경공단)",
  docsUrl: "https://www.data.go.kr/data/15073861/openapi.do",
  endpointTemplate: "GET /B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?serviceKey={REDACTED}&sidoName={시도}",
  attribution: "공공데이터포털 · 한국환경공단 에어코리아 대기오염정보",
};

export const kmaSource: WidgetPayload["source"] = {
  provider: "기상청 단기예보(초단기실황)",
  docsUrl: "https://www.data.go.kr/data/15084084/openapi.do",
  endpointTemplate: "GET /1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey={REDACTED}&nx={격자X}&ny={격자Y}",
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

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** 내 위치가 속한 시·도의 측정소 PM2.5 평균. 시·도를 알 수 없으면(한국 밖) 안내 오류. */
export async function fetchAirKorea(place: Place = DEFAULT_PLACE): Promise<WidgetPayload> {
  if (!place.sido) {
    throw new ProviderHttpError("에어코리아는 한국 시·도 단위로만 제공됩니다. 현재 위치가 한국이 아니거나 시·도를 확인하지 못했습니다.", 400);
  }
  const key = requireKey();
  const url = "http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty"
    + `?serviceKey=${encodeURIComponent(key)}&returnType=json&numOfRows=300&pageNo=1&sidoName=${encodeURIComponent(place.sido)}&ver=1.0`;
  const items = await fetchDataGoKr<AirItem[]>(url);
  const valid = Array.isArray(items)
    ? items.filter((entry) => Number.isFinite(Number(entry.pm25Value)) && entry.pm25Value !== "")
    : [];
  if (valid.length === 0) {
    throw new ProviderHttpError(`에어코리아에서 '${place.sido}' 측정소의 PM2.5 값을 찾지 못했습니다.`, 503);
  }
  const pm25 = Number(mean(valid.map((entry) => Number(entry.pm25Value))).toFixed(1));
  const pm10Values = valid.map((entry) => Number(entry.pm10Value)).filter((value) => Number.isFinite(value));
  const worst = valid.reduce((best, entry) => (Number(entry.pm25Value) > Number(best.pm25Value) ? entry : best));
  const latest = valid.map((entry) => entry.dataTime).sort().at(-1) ?? "";
  return {
    value: {
      headline: `PM2.5 ${pm25} μg/m³`,
      subline: `${place.sido} 평균 · 측정소 ${valid.length}곳`,
      metric: { key: `airkorea-${place.sido}-pm25`, label: `에어코리아 ${place.sido} PM2.5 평균`, value: pm25, unit: "μg/m³" },
      details: [
        { label: "PM10 평균", value: pm10Values.length ? `${Number(mean(pm10Values).toFixed(1))} μg/m³` : "측정값 없음" },
        { label: "가장 높은 곳", value: `${worst.stationName} ${worst.pm25Value}` },
      ],
    },
    status: "ok",
    source: airKoreaSource,
    sourceTimestamp: latest ? `${latest.replace(" ", "T")}:00+09:00` : undefined,
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

export async function fetchKmaWeather(place: Place = DEFAULT_PLACE, now = new Date()): Promise<WidgetPayload> {
  if (!isInKorea(place.lat, place.lon)) {
    throw new ProviderHttpError("기상청 실황은 한국 안의 위치에서만 제공됩니다.", 400);
  }
  const key = requireKey();
  const { nx, ny } = toKmaGrid(place.lat, place.lon);
  const { baseDate, baseTime } = kmaBaseTime(now);
  const url = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst"
    + `?serviceKey=${encodeURIComponent(key)}&pageNo=1&numOfRows=10&dataType=JSON`
    + `&base_date=${baseDate}&base_time=${baseTime}&nx=${nx}&ny=${ny}`;
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
      subline: `${place.name} · ${PTY[rain] ?? "강수 형태 미확인"} (기상청 실황)`,
      metric: { key: `kma-temp@${nx},${ny}`, label: `기상청 ${place.name} 기온`, value: temp, unit: "°C" },
      details: [
        { label: "습도", value: `${value("REH")}%` },
        { label: "1시간 강수", value: String(list.find((entry) => entry.category === "RN1")?.obsrValue ?? "-") },
        { label: "풍속", value: `${value("WSD")}m/s` },
        { label: "기상청 격자", value: `${nx}, ${ny}` },
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
