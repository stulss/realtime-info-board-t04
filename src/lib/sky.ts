/** WMO 날씨 코드 → 한국어 설명 */
export const WMO_LABELS: Record<number, string> = {
  0: "맑음", 1: "대체로 맑음", 2: "구름 조금", 3: "흐림", 45: "안개", 48: "서리 안개",
  51: "약한 이슬비", 53: "이슬비", 55: "강한 이슬비", 56: "약한 어는 이슬비", 57: "어는 이슬비",
  61: "약한 비", 63: "비", 65: "강한 비", 66: "약한 어는 비", 67: "어는 비",
  71: "약한 눈", 73: "눈", 75: "강한 눈", 77: "싸락눈",
  80: "소나기", 81: "강한 소나기", 82: "매우 강한 소나기", 85: "눈 소나기", 86: "강한 눈 소나기",
  95: "뇌우", 96: "우박 동반 뇌우", 99: "강한 우박 동반 뇌우",
};

export type SkyKind = "clear-day" | "clear-night" | "cloudy" | "rain" | "snow" | "fog" | "storm";

/**
 * 날씨 코드와 낮/밤으로 하늘 장면을 정한다.
 * 기본 그라디언트는 낮·밤, 그 위의 효과(구름·비·눈·안개·번개)는 날씨 상태로 결정한다.
 */
export function skyKind(weatherCode: number | undefined, isDay: boolean): SkyKind {
  const code = weatherCode ?? 0;
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code === 45 || code === 48) return "fog";
  if (code === 3) return "cloudy";
  return isDay ? "clear-day" : "clear-night";
}

export const SKY_MOOD: Record<SkyKind, string> = {
  "clear-day": "맑고 화창해요",
  "clear-night": "맑은 밤이에요",
  cloudy: "구름이 많아요",
  rain: "비가 내려요",
  snow: "눈이 내려요",
  fog: "안개가 꼈어요",
  storm: "천둥·번개가 쳐요",
};

export function weatherLabel(code: number | undefined): string {
  return code === undefined ? "날씨 확인 중" : WMO_LABELS[code] ?? `날씨 코드 ${code}`;
}
