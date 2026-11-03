"use client";

import { useSyncExternalStore } from "react";
import {
  DAILY_LOG_EVENT,
  DAILY_LOG_STORAGE_KEY,
  parseDailyLog,
  type DailyLogEntry,
} from "./daily-log";

const EMPTY: DailyLogEntry[] = [];
let cachedRaw: string | null | undefined;
let cachedEntries: DailyLogEntry[] = EMPTY;

function subscribe(onChange: () => void) {
  window.addEventListener(DAILY_LOG_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DAILY_LOG_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** useSyncExternalStore는 같은 입력에 같은 참조를 요구하므로 raw 문자열 기준으로 캐시한다. */
function getSnapshot(): DailyLogEntry[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(DAILY_LOG_STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedEntries = parseDailyLog(raw);
  }
  return cachedEntries;
}

/** 브라우저에 저장된 날짜별 기록을 구독한다. 서버 렌더에서는 빈 배열. */
export function useDailyLog(): DailyLogEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
