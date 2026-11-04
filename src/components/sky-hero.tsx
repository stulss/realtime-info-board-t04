"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchWidgetPayload } from "@/lib/client/widget-state";
import { placeQuery } from "@/lib/location";
import { SKY_MOOD, skyKind, weatherLabel } from "@/lib/sky";
import { Icon } from "./icons";
import { LocationChip, useLocation } from "./location-provider";

type Props = {
  currentDate: string;
  onRefreshAll: () => void;
  isRefreshingAll: boolean;
};

/**
 * 첫 화면의 주인공: 내 위치의 현재 날씨로 하늘 장면(낮/밤 + 날씨 효과)이 바뀐다.
 * 위젯 카드와 같은 queryKey를 써서 추가 요청 없이 캐시를 공유한다.
 * 데이터 층은 반투명 유리 패널 위에 올려 어떤 배경에서도 읽히게 한다.
 */
export function SkyHero({ currentDate, onRefreshAll, isRefreshingAll }: Props) {
  const { place } = useLocation();
  const query = placeQuery(place);
  const path = query ? `/api/widgets/weather?${query}` : "/api/widgets/weather";
  const { data } = useQuery({
    queryKey: ["widget", "weather", path],
    queryFn: () => fetchWidgetPayload(path),
    refetchInterval: 10 * 60_000,
    retry: false,
  });

  const facts = data?.value?.facts;
  const ready = typeof facts?.temperature === "number";
  const kind = ready ? skyKind(facts.weatherCode, facts.isDay !== 0) : "clear-day";

  return (
    <section className="sky" data-sky={ready ? kind : "loading"} aria-labelledby="sky-heading">
      <div className="sky__fx" aria-hidden="true"><i /><i /><i /></div>
      <div className="sky__top">
        <p className="sky__date">{currentDate}</p>
        <div className="sky__actions">
          <LocationChip />
          <button className="sky__refresh" type="button" onClick={onRefreshAll} disabled={isRefreshingAll}>
            <Icon name="refresh" size={14} className={isRefreshingAll ? "spin" : undefined} />
            {isRefreshingAll ? "갱신 중" : "전체 새로고침"}
          </button>
        </div>
      </div>

      <div className="sky__main">
        <h1 id="sky-heading" className="sky__place">
          <Icon name="pin" size={18} />
          {place.name}
        </h1>
        <p className="sky__temp" aria-label={ready ? `현재 기온 ${facts.temperature.toFixed(1)}도` : "기온 확인 중"}>
          {ready ? Math.round(facts.temperature) : "–"}<span>°</span>
        </p>
        <p className="sky__cond">
          {ready ? weatherLabel(facts.weatherCode) : "날씨를 불러오는 중"}
          {ready && <small> · {SKY_MOOD[kind]}</small>}
        </p>
        {ready && (
          <dl className="sky__stats">
            <div><dt>체감</dt><dd>{Math.round(facts.apparent)}°</dd></div>
            <div><dt>습도</dt><dd>{Math.round(facts.humidity)}%</dd></div>
            <div><dt>바람</dt><dd>{facts.wind.toFixed(1)}km/h</dd></div>
          </dl>
        )}
      </div>
    </section>
  );
}
