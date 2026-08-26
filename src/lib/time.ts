import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";

dayjs.extend(relativeTime);
dayjs.locale("ko");

export function formatRelativeTime(value?: string, referenceTime = Date.now()): string {
  if (!value) return "API 미제공";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.from(dayjs(referenceTime)) : "시각 확인 불가";
}

export function formatAbsoluteTime(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("YYYY.MM.DD HH:mm:ss") : undefined;
}

export function formatCountdown(value?: string, now = Date.now()): string {
  if (!value) return "자동 갱신 없음";
  const remainingSeconds = Math.max(0, Math.ceil((new Date(value).getTime() - now) / 1000));
  if (remainingSeconds >= 60) {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${minutes}분 ${seconds}초 후`;
  }
  return `${remainingSeconds}초 후`;
}
