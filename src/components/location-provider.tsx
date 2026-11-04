"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_PLACE, shortSido, type Place } from "@/lib/location";

export type LocationMode = "idle" | "locating" | "device" | "default" | "denied" | "unavailable" | "unsupported";

type LocationState = {
  place: Place;
  mode: LocationMode;
  /** 브라우저 위치 권한을 요청해 내 위치로 전환한다. */
  useDevice: () => void;
  /** 위치 대신 기본 위치(서울)를 쓴다. */
  useDefault: () => void;
};

const STORAGE_KEY = "pulseboard-location-v1";

const LocationContext = createContext<LocationState>({
  place: DEFAULT_PLACE,
  mode: "idle",
  useDevice: () => {},
  useDefault: () => {},
});

export function useLocation(): LocationState {
  return useContext(LocationContext);
}

type Saved = { mode: "device"; place: Place } | { mode: "default" };

function readSaved(): Saved | undefined {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const saved = parsed as Partial<{ mode: string; place: Place }>;
    if (saved.mode === "default") return { mode: "default" };
    const p = saved.place;
    if (saved.mode === "device" && p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && typeof p.name === "string") {
      return { mode: "device", place: { lat: p.lat, lon: p.lon, name: p.name, sido: shortSido(p.sido) } };
    }
  } catch {
    // 저장소 접근 불가·손상은 무시하고 새로 시작한다.
  }
  return undefined;
}

function write(saved: Saved) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // 저장 실패는 치명적이지 않다.
  }
}

const round2 = (value: number) => Math.round(value * 100) / 100;

async function lookupName(lat: number, lon: number): Promise<{ name: string; sido?: string }> {
  try {
    const response = await fetch(`/api/place?lat=${lat}&lon=${lon}`, { signal: AbortSignal.timeout(7_000) });
    if (!response.ok) return { name: "내 위치" };
    const body = (await response.json()) as { name?: unknown; sido?: unknown };
    return {
      name: typeof body.name === "string" && body.name ? body.name : "내 위치",
      sido: shortSido(typeof body.sido === "string" ? body.sido : undefined),
    };
  } catch {
    return { name: "내 위치" };
  }
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [place, setPlace] = useState<Place>(DEFAULT_PLACE);
  const [mode, setMode] = useState<LocationMode>("idle");
  const requestId = useRef(0);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMode("unsupported");
      return;
    }
    const id = ++requestId.current;
    setMode((current) => (current === "device" ? current : "locating"));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void (async () => {
          const lat = round2(position.coords.latitude);
          const lon = round2(position.coords.longitude);
          const resolved = await lookupName(lat, lon);
          if (id !== requestId.current) return; // 더 최신 요청이 있으면 버린다.
          const next: Place = { lat, lon, ...resolved };
          setPlace(next);
          setMode("device");
          write({ mode: "device", place: next });
        })();
      },
      (error) => {
        if (id !== requestId.current) return;
        // 이미 저장된 내 위치가 있으면 그대로 유지한다.
        setMode((current) => (current === "device" ? current : error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"));
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  }, []);

  const useDefault = useCallback(() => {
    requestId.current += 1;
    setPlace(DEFAULT_PLACE);
    setMode("default");
    write({ mode: "default" });
  }, []);

  // 첫 렌더는 서버와 같은 기본 위치로 맞추고(하이드레이션 일치), 마운트 후 저장값·현재 위치로 전환한다.
  // 사용자 동작 없이 권한 창을 띄우지 않는다: 저장된 위치가 있거나 브라우저 권한이 이미 "허용"일 때만 자동으로 쓴다.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      if (cancelled) return;
      const saved = readSaved();
      if (saved?.mode === "default") {
        setMode("default");
        return;
      }
      if (saved?.mode === "device") {
        setPlace(saved.place);
        setMode("device");
        locate();
        return;
      }
      try {
        const status = await navigator.permissions?.query({ name: "geolocation" });
        if (!cancelled && status?.state === "granted") locate();
      } catch {
        // Permissions API가 없으면 기본 위치(서울)로 두고 버튼으로 안내한다.
      }
    });
    return () => { cancelled = true; };
  }, [locate]);

  const value = useMemo<LocationState>(
    () => ({ place, mode, useDevice: locate, useDefault }),
    [place, mode, locate, useDefault],
  );
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

const MODE_TEXT: Record<LocationMode, string> = {
  idle: "서울 기준 · 내 위치로 바꿔 보세요",
  locating: "내 위치 확인 중…",
  device: "내 위치 기준",
  default: "기본 위치(서울)",
  denied: "위치 권한이 꺼져 있어요 · 서울 기준",
  unavailable: "위치를 못 가져와 서울 기준",
  unsupported: "위치 기능 미지원 · 서울 기준",
};

/** 헤더의 위치 표시 칩. */
export function LocationChip() {
  const { place, mode, useDevice, useDefault } = useLocation();
  const canUseDevice = mode !== "device" && mode !== "locating" && mode !== "unsupported";
  return (
    <div className="loc-chip" data-mode={mode} role="group" aria-label="날씨 기준 위치">
      <div className="loc-chip__text">
        <span className="sr-only">{place.name} </span>
        <small>{MODE_TEXT[mode]}</small>
      </div>
      {canUseDevice && (
        <button type="button" onClick={useDevice}>내 위치 사용</button>
      )}
      {mode === "device" && (
        <button type="button" onClick={useDefault} title="위치 대신 서울 날씨를 봅니다">서울로 보기</button>
      )}
    </div>
  );
}
