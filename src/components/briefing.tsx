"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchWidgetPayload } from "@/lib/client/widget-state";
import { pm25Grade, uvGrade } from "@/lib/air-grade";
import { placeQuery } from "@/lib/location";
import type { WidgetPayload } from "@/types/widget";
import { Icon, type IconName } from "./icons";
import { useLocation } from "./location-provider";

type Tone = "good" | "warn" | "bad" | "idle";
type Tile = { icon: IconName; label: string; value: string; note: string; tone: Tone };

/** 위젯 카드와 같은 queryKey를 써서 추가 네트워크 요청 없이 캐시를 공유한다. */
function useWidget(id: string, interval: number, located = false): WidgetPayload | undefined {
  const { place } = useLocation();
  const query = located ? placeQuery(place) : "";
  const path = query ? `/api/widgets/${id}?${query}` : `/api/widgets/${id}`;
  return useQuery({
    queryKey: ["widget", id, path],
    queryFn: () => fetchWidgetPayload(path),
    retry: false,
    refetchInterval: interval,
  }).data;
}

export function buildBriefing(
  forecast: WidgetPayload | undefined,
  air: WidgetPayload | undefined,
  holiday: WidgetPayload | undefined,
): Tile[] {
  // 값이 비었거나 숫자가 아니면 "확인 중"으로 보여 NaN·undefined가 화면에 나오지 않게 한다.
  const ok = (facts: Record<string, number> | undefined, keys: string[]) =>
    facts !== undefined && keys.every((key) => Number.isFinite(facts[key])) ? facts : undefined;
  const f = ok(forecast?.value?.facts, ["tmax", "tmin", "uvMax", "precipProbability"]);
  const a = ok(air?.value?.facts, ["pm25"]);
  const h = ok(holiday?.value?.facts, ["daysUntil"]);
  const tiles: Tile[] = [];

  tiles.push(f
    ? { icon: "thermometer", label: "오늘 기온", value: `${Math.round(f.tmax)}° / ${Math.round(f.tmin)}°`, note: `일교차 ${Math.round(f.tmax - f.tmin)}°`, tone: f.tmax - f.tmin >= 12 ? "warn" : "good" }
    : { icon: "thermometer", label: "오늘 기온", value: "확인 중", note: "예보 대기", tone: "idle" });

  tiles.push(f
    ? {
      icon: "umbrella", label: "우산", value: f.precipProbability >= 50 ? "챙기세요" : "필요 없음",
      note: `강수확률 ${f.precipProbability}%`, tone: f.precipProbability >= 50 ? "bad" : f.precipProbability >= 30 ? "warn" : "good",
    }
    : { icon: "umbrella", label: "우산", value: "확인 중", note: "예보 대기", tone: "idle" });

  tiles.push(f
    ? { icon: "sun", label: "자외선", value: uvGrade(f.uvMax), note: `최대 지수 ${f.uvMax}`, tone: f.uvMax >= 6 ? "bad" : f.uvMax >= 3 ? "warn" : "good" }
    : { icon: "sun", label: "자외선", value: "확인 중", note: "예보 대기", tone: "idle" });

  tiles.push(a
    ? { icon: "air", label: "미세먼지", value: pm25Grade(a.pm25), note: `PM2.5 ${a.pm25} μg/m³`, tone: a.pm25 > 75 ? "bad" : a.pm25 > 35 ? "warn" : "good" }
    : { icon: "air", label: "미세먼지", value: "확인 중", note: "대기질 대기", tone: "idle" });

  tiles.push(h
    ? {
      icon: "holiday", label: "다음 공휴일", value: h.daysUntil <= 0 ? "오늘" : `D-${h.daysUntil}`,
      note: holiday?.value?.subline ?? "", tone: h.daysUntil <= 7 ? "good" : "idle",
    }
    : { icon: "holiday", label: "다음 공휴일", value: "확인 중", note: "공휴일 대기", tone: "idle" });

  return tiles;
}

export function Briefing() {
  const forecast = useWidget("weather-forecast", 60 * 60_000, true);
  const air = useWidget("air-quality", 30 * 60_000, true);
  const holiday = useWidget("holiday", 60 * 60_000);
  const tiles = buildBriefing(forecast, air, holiday);

  return (
    <section className="briefing" aria-labelledby="briefing-heading">
      <h2 id="briefing-heading" className="sr-only">오늘 브리핑</h2>
      <ul className="briefing__tiles">
        {tiles.map((tile, index) => (
          <li key={tile.label} className="briefing__tile" data-tone={tile.tone} style={{ animationDelay: `${index * 70}ms` }}>
            <span className="briefing__icon"><Icon name={tile.icon} size={20} /></span>
            <span className="briefing__label">{tile.label}</span>
            <strong>{tile.value}</strong>
            <small>{tile.note}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
