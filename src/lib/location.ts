import { ProviderHttpError } from "@/lib/server/http";

export type Place = {
  /** 소수 둘째 자리(약 1km)로 반올림한 위도 */
  lat: number;
  lon: number;
  /** 화면 표시용 지명 (예: "부산 연산5동") */
  name: string;
  /** 한국 시·도 약칭 (예: "부산"). 한국 밖이면 없음 */
  sido?: string;
};

export const DEFAULT_PLACE: Place = { lat: 37.57, lon: 126.98, name: "서울", sido: "서울" };

export const SIDO_NAMES = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
] as const;

const SIDO_FULL: Record<string, (typeof SIDO_NAMES)[number]> = {
  서울특별시: "서울", 부산광역시: "부산", 대구광역시: "대구", 인천광역시: "인천",
  광주광역시: "광주", 대전광역시: "대전", 울산광역시: "울산", 세종특별자치시: "세종",
  경기도: "경기", 강원도: "강원", 강원특별자치도: "강원", 충청북도: "충북", 충청남도: "충남",
  전라북도: "전북", 전북특별자치도: "전북", 전라남도: "전남", 경상북도: "경북", 경상남도: "경남",
  제주특별자치도: "제주", 제주도: "제주",
};

/** "부산광역시" → "부산". 17개 시·도가 아니면 undefined. */
export function shortSido(name: string | undefined): (typeof SIDO_NAMES)[number] | undefined {
  if (!name) return undefined;
  return SIDO_FULL[name.trim()] ?? SIDO_NAMES.find((short) => short === name.trim());
}

export function isInKorea(lat: number, lon: number): boolean {
  return lat >= 32.5 && lat <= 39 && lon >= 124 && lon <= 132;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** 기록·캐시 키용 위치 식별자. 약 10km 격자라 같은 동네의 미세한 좌표 변화는 같은 키가 된다. */
export function placeKey(place: Place): string {
  return `${place.lat.toFixed(1)},${place.lon.toFixed(1)}`;
}

const NAME_PATTERN = /^[\p{L}\p{N}\s·.\-()]+$/u;

/** 쿼리스트링에서 위치를 읽는다. 없으면 서울, 잘못된 값이면 400. */
export function parsePlace(params: URLSearchParams): Place {
  const latRaw = params.get("lat");
  const lonRaw = params.get("lon");
  if (latRaw === null && lonRaw === null) return DEFAULT_PLACE;

  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!latRaw || !lonRaw || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new ProviderHttpError("위치(lat, lon) 값이 올바르지 않습니다.", 400);
  }
  const rawName = params.get("place")?.trim() ?? "";
  const name = rawName && rawName.length <= 30 && NAME_PATTERN.test(rawName) ? rawName : "내 위치";
  const sido = shortSido(params.get("sido") ?? undefined);
  return { lat: round2(lat), lon: round2(lon), name, sido };
}

/** 클라이언트가 위치 의존 위젯 API에 붙이는 쿼리스트링. 기본 위치(서울)면 비운다. */
export function placeQuery(place: Place): string {
  if (place.lat === DEFAULT_PLACE.lat && place.lon === DEFAULT_PLACE.lon) return "";
  const params = new URLSearchParams({ lat: String(place.lat), lon: String(place.lon), place: place.name });
  if (place.sido) params.set("sido", place.sido);
  return params.toString();
}

/** 위경도 → 기상청 단기예보 격자(nx, ny). 기상청 공식 Lambert Conformal Conic 변환. */
export function toKmaGrid(lat: number, lon: number): { nx: number; ny: number } {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;
  const D2R = Math.PI / 180;

  const re = RE / GRID;
  const slat1 = SLAT1 * D2R;
  const slat2 = SLAT2 * D2R;
  const olon = OLON * D2R;
  const olat = OLAT * D2R;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * D2R * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * D2R - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}
