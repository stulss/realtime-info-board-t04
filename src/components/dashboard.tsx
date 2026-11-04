"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"; 
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
import { LocationProvider, useLocation } from "./location-provider";
import { Icon, type IconName } from "./icons";
import { SkyHero } from "./sky-hero";
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
  icon: IconName;
  interval: number;
  size?: "wide";
  /** true면 내 위치(lat, lon, place, sido)를 API에 전달한다. */
  located?: boolean;
  /** 서버에 이 키가 설정돼 있어야 요청한다(없으면 안내로 대체). */
  requires?: "dataGoKr";
};

type ServerConfig = { dataGoKr: boolean; exim: boolean };

const titleOf = (widget: WidgetDef, place: Place) => (typeof widget.name === "function" ? widget.name(place) : widget.name);

/** 중요도 순서. 날씨는 위 히어로가 맡고, 시세는 넓은 타일, 나머지는 균일한 타일. */
const WIDGETS: readonly WidgetDef[] = [
  { id: "upbit-ticker", group: "market", name: "비트코인", icon: "bitcoin", interval: 20_000, size: "wide" },
  { id: "weather-forecast", group: "env", name: (p) => `${p.name} 오늘 예보`, icon: "forecast", interval: 60 * 60_000, located: true },
  { id: "air-quality", group: "env", name: (p) => `${p.name} 대기질`, icon: "air", interval: 30 * 60_000, located: true },
  { id: "weather", group: "env", name: (p) => `${p.name} 날씨`, icon: "cloud", interval: 10 * 60_000, located: true },
  { id: "exchange-rate", group: "market", name: "원화 환율", icon: "fx", interval: 60 * 60_000 },
  { id: "holiday", group: "life", name: "다음 공휴일", icon: "holiday", interval: 60 * 60_000 },
  { id: "kma-weather", group: "env", name: (p) => `기상청 ${p.name}`, icon: "sun", interval: 10 * 60_000, located: true, requires: "dataGoKr" },
  { id: "airkorea", group: "env", name: (p) => `에어코리아 ${p.sido ?? p.name}`, icon: "leaf", interval: 30 * 60_000, located: true, requires: "dataGoKr" },
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
  onReport,
}: {
  widget: WidgetDef;
  requestPath?: string;
  controls?: ReactNode;
  hidden: boolean;
  /** API 키가 없어 쓸 수 없는 위젯인지 알린다(오류 카드 대신 안내로 대체). */
  onReport?: (id: string, title: string, unconfigured: boolean) => void;
}) {
  const { place } = useLocation();
  const title = titleOf(widget, place);
  const locQuery = widget.located ? placeQuery(place) : "";
  requestPath ??= locQuery ? `/api/widgets/${widget.id}?${locQuery}` : `/api/widgets/${widget.id}`;
  // 서버 설정(키 보유 여부)을 한 번만 확인한다. 확인에 실패하면 막지 않고 평소처럼 요청한다.
  const configQuery = useQuery({
    queryKey: ["server-config"],
    queryFn: async (): Promise<ServerConfig> => {
      const response = await fetch("/api/config");
      if (!response.ok) throw new Error("config");
      return (await response.json()) as ServerConfig;
    },
    staleTime: Infinity,
    retry: false,
  });
  const keyMissing = Boolean(widget.requires) && configQuery.data?.[widget.requires!] === false;
  const waitingConfig = Boolean(widget.requires) && configQuery.isPending;

  const query = useQuery({
    enabled: !keyMissing && !waitingConfig,
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

  const unconfigured = keyMissing || (!displayData.value && displayData.lastError?.kind === "unauthorized");
  useEffect(() => {
    onReport?.(widget.id, title, unconfigured);
  }, [onReport, widget.id, title, unconfigured]);

  // 숨겨도 쿼리는 유지해 기록·브리핑이 끊기지 않게 한다.
  return (
    <div className="tile-slot" hidden={hidden || unconfigured} data-empty={!displayData.value || undefined} data-size={widget.size}>
      <WidgetTile
        icon={<Icon name={widget.icon} size={14} />}
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
  const [unconfigured, setUnconfigured] = useState<Record<string, string>>({});
  const reportWidget = useCallback((id: string, title: string, off: boolean) => {
    setUnconfigured((current) => {
      if (off ? current[id] === title : !(id in current)) return current;
      const next = { ...current };
      if (off) next[id] = title; else delete next[id];
      return next;
    });
  }, []);



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
          <Link className="text-link hide-mobile" href="/verification">장애 시뮬레이터</Link>
          <button className="icon-button" type="button" onClick={toggleTheme} aria-label="테마 전환" suppressHydrationWarning>{isDark ? "☀" : "◐"}</button>
        </div>
      </header>

      <SkyHero currentDate={currentDate} onRefreshAll={() => void refreshAll()} isRefreshingAll={isRefreshingAll} />

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
                onReport={reportWidget}
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
          return <DashboardWidget key={widget.id} widget={widget} hidden={hidden} onReport={reportWidget} />;
        })}
      </section>

      {Object.keys(unconfigured).length > 0 && (
        <aside className="connect-hint" aria-label="연결 가능한 공식 데이터">
          <strong>연결하면 더 보여요</strong>
          <span>{Object.values(unconfigured).join(" · ")} — 공공데이터포털 API 키를 등록하면 자동으로 표시됩니다.</span>
          <Link href="/about#setup">등록 방법</Link>
        </aside>
      )}

      <DailyLogPanel selectedDate={pickedDate} onSelectDate={setPickedDate} />
      <DailyCloseSync />

      <footer className="page-footer">
        <span>Daylog</span>
        <p>데이터는 각 공급자 API의 제공 범위와 갱신 주기를 따릅니다. <Link href="/about">데이터 출처·개인정보</Link></p>
      </footer>
    </main>
  );
}
