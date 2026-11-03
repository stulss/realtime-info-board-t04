"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { WidgetPayload } from "@/types/widget";
import {
  DEFAULT_EXCHANGE_CURRENCY,
  EXCHANGE_CURRENCIES,
  type ExchangeCurrency,
} from "@/lib/widget-options";
import { WidgetTile } from "./widget-tile";
import { DailyCloseSync } from "./daily-close-sync";
import { DailyLogPanel } from "./daily-log-panel";
import { recordWidgetMetric, seriesFor } from "@/lib/history/daily-log";
import { useDailyLog } from "@/lib/history/use-daily-log";
import { Briefing } from "./briefing";
import { LocationChip, LocationProvider, useLocation } from "./location-provider";
import { placeQuery, type Place } from "@/lib/location";
import {
  displayPayloadAfterFailure,
  fetchWidgetPayload,
} from "@/lib/client/widget-state";

type Group = "market" | "env" | "life";
type WidgetDef = {
  id: string;
  group: Group;
  /** 위치 기반 위젯은 현재 위치로 이름을 만든다. */
  name: string | ((place: Place) => string);
  icon: string;
  interval: number;
  size?: "wide";
  /** true면 내 위치(lat, lon, place, sido)를 API에 전달한다. */
  located?: boolean;
};

const titleOf = (widget: WidgetDef, place: Place) => (typeof widget.name === "function" ? widget.name(place) : widget.name);

/** 중요도 순서. 핵심 2개는 넓게, 나머지는 균일한 타일. */
const WIDGETS: readonly WidgetDef[] = [
  { id: "weather", group: "env", name: (p) => `${p.name} 날씨`, icon: "☁", interval: 10 * 60_000, size: "wide", located: true },
  { id: "upbit-ticker", group: "market", name: "비트코인", icon: "₿", interval: 20_000, size: "wide" },
  { id: "weather-forecast", group: "env", name: (p) => `${p.name} 오늘 예보`, icon: "◐", interval: 60 * 60_000, located: true },
  { id: "air-quality", group: "env", name: (p) => `${p.name} 대기질`, icon: "◌", interval: 30 * 60_000, located: true },
  { id: "exchange-rate", group: "market", name: "원·달러 고시환율", icon: "₩", interval: 60 * 60_000 },
  { id: "holiday", group: "life", name: "다음 공휴일", icon: "★", interval: 60 * 60_000 },
  { id: "kma-weather", group: "env", name: (p) => `기상청 ${p.name}`, icon: "☀", interval: 10 * 60_000, located: true },
  { id: "airkorea", group: "env", name: (p) => `에어코리아 ${p.sido ?? p.name}`, icon: "≋", interval: 30 * 60_000, located: true },
];

const FILTERS = [
  { id: "all", title: "전체" },
  { id: "market", title: "시세·환율" },
  { id: "env", title: "날씨·대기" },
  { id: "life", title: "생활" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

function DashboardWidget({
  widget,
  requestPath,
  controls,
  hidden,
}: {
  widget: WidgetDef;
  requestPath?: string;
  controls?: ReactNode;
  hidden: boolean;
}) {
  const { place } = useLocation();
  const title = titleOf(widget, place);
  const locQuery = widget.located ? placeQuery(place) : "";
  requestPath ??= locQuery ? `/api/widgets/${widget.id}?${locQuery}` : `/api/widgets/${widget.id}`;
  const query = useQuery({
    queryKey: ["widget", widget.id, requestPath],
    queryFn: () => fetchWidgetPayload(requestPath),
    retry: false,
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState === "hidden"
        ? widget.interval * 4
        : widget.interval,
  });

  const logEntries = useDailyLog();
  const metricKey = query.data?.value?.metric?.key;
  const history = metricKey ? seriesFor(logEntries, metricKey, 7) : undefined;
  const metric = query.data?.status === "ok" ? query.data.value?.metric : undefined;
  const metricFetchedAt = query.data?.fetchedAt;
  useEffect(() => {
    if (metric && metricFetchedAt) recordWidgetMetric(metric, metricFetchedAt);
  }, [metric, metricFetchedAt]);

  const sourceFallback: WidgetPayload["source"] = {
    provider: title,
    docsUrl: "#",
    endpointTemplate: `/api/widgets/${widget.id}`,
  };
  const fallback: WidgetPayload = {
    value: null,
    status: "refreshing",
    source: sourceFallback,
    fetchedAt: "",
    cacheAgeMs: 0,
    warning: "데이터를 불러오는 중입니다.",
  };
  const displayData = query.error
    ? displayPayloadAfterFailure(query.data, query.error, sourceFallback)
    : query.data ?? fallback;

  // 숨겨도 쿼리는 유지해 기록·브리핑이 끊기지 않게 한다.
  return (
    <div className="tile-slot" hidden={hidden} data-empty={!displayData.value || undefined} data-size={widget.size}>
      <WidgetTile
        icon={widget.icon}
        name={title}
        data={displayData}
        isRefreshing={query.isFetching}
        onRefresh={() => void query.refetch()}
        controls={controls}
        history={history}
        size={widget.size}
      />
    </div>
  );
}

export function Dashboard() {
  return (
    <LocationProvider>
      <DashboardView />
    </LocationProvider>
  );
}

function DashboardView() {
  const queryClient = useQueryClient();
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const savedTheme = window.localStorage.getItem("pulseboard-theme");
    return savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [currency, setCurrency] = useState<ExchangeCurrency>(DEFAULT_EXCHANGE_CURRENCY);
  const [filter, setFilter] = useState<Filter>("all");
  const [pickedDate, setPickedDate] = useState<string | null>(null);



  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
  }, [isDark]);

  const currentDate = useMemo(
    () => new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(new Date()),
    [],
  );

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    window.localStorage.setItem("pulseboard-theme", next ? "dark" : "light");
  }

  async function refreshAll() {
    setIsRefreshingAll(true);
    await queryClient.invalidateQueries({ queryKey: ["widget"] });
    setIsRefreshingAll(false);
  }

  return (
    <main id="main" className="dashboard-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">D</span><span>Daylog</span></div>
        <div className="topbar-actions">
          <Link className="text-link hide-mobile" href="/verification">상태 검증</Link>
          <button className="icon-button" type="button" onClick={toggleTheme} aria-label="테마 전환" suppressHydrationWarning>{isDark ? "☀" : "◐"}</button>
        </div>
      </header>

      <section className="dash-head">
        <div>
          <p className="eyebrow">{currentDate} · PERSONAL LIVE BOARD</p>
          <h1>오늘 한눈에</h1>
        </div>
        <div className="dash-head__meta">
          <LocationChip />
          <span className="live-dot"><i /> LIVE</span>
          <button className="refresh-all" type="button" onClick={() => void refreshAll()} disabled={isRefreshingAll}>
            <span className={isRefreshingAll ? "spin" : ""}>↻</span>{isRefreshingAll ? "갱신 중" : "전체 새로고침"}
          </button>
        </div>
      </section>

      <Briefing />

      <section className="section-heading">
        <div><span>01</span><h2>내 정보판</h2></div>
        <div className="filter-chips" role="group" aria-label="위젯 분류">
          {FILTERS.map((item) => {
            const count = item.id === "all" ? WIDGETS.length : WIDGETS.filter((widget) => widget.group === item.id).length;
            return (
              <button key={item.id} type="button" className="filter-chip" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                {item.title}<small>{count}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="tile-grid" aria-label="실시간 정보 위젯">
        {WIDGETS.map((widget) => {
          const hidden = filter !== "all" && widget.group !== filter;
          if (widget.id === "exchange-rate") {
            return (
              <DashboardWidget
                key={widget.id}
                widget={widget}
                hidden={hidden}
                requestPath={`/api/widgets/exchange-rate?currency=${encodeURIComponent(currency)}`}
                controls={(
                  <label className="widget-select" htmlFor="exchange-currency">
                    <span>통화 선택</span>
                    <select
                      id="exchange-currency"
                      value={currency}
                      onChange={(event) => setCurrency(event.target.value as ExchangeCurrency)}
                    >
                      {EXCHANGE_CURRENCIES.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                )}
              />
            );
          }
          return <DashboardWidget key={widget.id} widget={widget} hidden={hidden} />;
        })}
      </section>

      <DailyLogPanel selectedDate={pickedDate} onSelectDate={setPickedDate} />
      <DailyCloseSync />

      <footer className="page-footer">
        <span>Daylog</span>
        <p>데이터는 각 공급자 API의 제공 범위와 갱신 주기를 따릅니다. <Link href="/about">데이터 출처·개인정보</Link></p>
      </footer>
    </main>
  );
}
