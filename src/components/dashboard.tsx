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
import { WidgetCard } from "./widget-card";
import { DailyHistoryPanel } from "./daily-history-panel";
import { DailyLogPanel } from "./daily-log-panel";
import { recordWidgetMetric, seriesFor } from "@/lib/history/daily-log";
import { useDailyLog } from "@/lib/history/use-daily-log";
import { Briefing } from "./briefing";
import {
  displayPayloadAfterFailure,
  fetchWidgetPayload,
} from "@/lib/client/widget-state";

const WIDGETS = [
  { id: "upbit-ticker", group: "market", name: "비트코인", icon: "₿", interval: 20_000 },
  { id: "coingecko", group: "market", name: "이더리움 (CoinGecko)", icon: "Ξ", interval: 2 * 60_000 },
  { id: "exchange-rate", group: "market", name: "원·달러 고시환율", icon: "₩", interval: 60 * 60_000 },
  { id: "frankfurter-rate", group: "market", name: "USD/KRW 국제 참조환율", icon: "$", interval: 60 * 60_000 },
  { id: "kma-weather", group: "env", name: "기상청 서울 날씨", icon: "☀", interval: 10 * 60_000 },
  { id: "weather", group: "env", name: "서울 날씨 (Open-Meteo)", icon: "☁", interval: 10 * 60_000 },
  { id: "weather-forecast", group: "env", name: "서울 오늘 예보", icon: "◐", interval: 60 * 60_000 },
  { id: "airkorea", group: "env", name: "에어코리아 미세먼지", icon: "≋", interval: 30 * 60_000 },
  { id: "air-quality", group: "env", name: "서울 대기질 (Open-Meteo)", icon: "◌", interval: 30 * 60_000 },
  { id: "sensor-community", group: "env", name: "시민 센서 PM2.5", icon: "⌁", interval: 5 * 60_000 },
  { id: "usgs-earthquake", group: "world", name: "전 세계 지진 (USGS)", icon: "〰", interval: 5 * 60_000 },
  { id: "iss", group: "world", name: "국제우주정거장 위치", icon: "✦", interval: 15_000 },
  { id: "kp-index", group: "world", name: "우주날씨 (지자기 Kp)", icon: "☄", interval: 15 * 60_000 },
  { id: "holiday", group: "world", name: "다음 공휴일", icon: "★", interval: 60 * 60_000 },
  { id: "status", group: "world", name: "GitHub 서비스 상태", icon: "◉", interval: 5 * 60_000 },
] as const;

const GROUPS = [
  { id: "market", title: "시세 · 환율" },
  { id: "env", title: "날씨 · 대기" },
  { id: "world", title: "세계 · 생활" },
] as const;

function DashboardWidget({
  widget,
  requestPath = `/api/widgets/${widget.id}`,
  controls,
}: {
  widget: (typeof WIDGETS)[number];
  requestPath?: string;
  controls?: ReactNode;
}) {
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
    provider: widget.name,
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

  return (
    <WidgetCard
      icon={widget.icon}
      name={widget.name}
      data={displayData}
      isRefreshing={query.isFetching}
      onRefresh={() => void query.refetch()}
      controls={controls}
      history={history}
    />
  );
}

export function Dashboard() {
  const queryClient = useQueryClient();
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const savedTheme = window.localStorage.getItem("pulseboard-theme");
    return savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [currency, setCurrency] = useState<ExchangeCurrency>(DEFAULT_EXCHANGE_CURRENCY);

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

  const exchangeWidget = WIDGETS.find(({ id }) => id === "exchange-rate")!;

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">P</span><span>Pulseboard</span></div>
        <div className="topbar-actions">
          <Link className="text-link hide-mobile" href="/verification">상태 검증</Link>
          <button className="icon-button" type="button" onClick={toggleTheme} aria-label="테마 전환" suppressHydrationWarning>{isDark ? "☀" : "◐"}</button>
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">PERSONAL LIVE INTELLIGENCE</p>
          <h1>오늘 필요한 정보만,<br /><em>근거와 함께.</em></h1>
          <p className="hero-copy">값만 보여주지 않습니다. 공급자, 원천 시각, 실제 조회 시각까지 한눈에 확인하세요.</p>
        </div>
        <div className="hero-meta">
          <span className="live-dot"><i /> LIVE</span>
          <strong>{currentDate}</strong>
          <button className="refresh-all" type="button" onClick={() => void refreshAll()} disabled={isRefreshingAll}>
            <span className={isRefreshingAll ? "spin" : ""}>↻</span>{isRefreshingAll ? "갱신 중" : "전체 새로고침"}
          </button>
        </div>
      </section>

      <Briefing />

      <section className="section-heading">
        <div><span>01</span><h2>내 정보판</h2></div>
        <p>{WIDGETS.length}개의 공개 데이터 소스 · 정상 조회값은 날짜별로 자동 기록</p>
      </section>

      {GROUPS.map((group) => (
        <section key={group.id} className="widget-group" data-group={group.id} aria-label={`${group.title} 위젯`}>
          <h3 className="group-title">{group.title}</h3>
          <div className="widget-grid">
            {WIDGETS.filter((widget) => widget.group === group.id).map((widget) => {
          if (widget.id === "exchange-rate") {
            return (
              <DashboardWidget
                key={widget.id}
                widget={exchangeWidget}
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
          return <DashboardWidget key={widget.id} widget={widget} />;
        })}
          </div>
        </section>
      ))}

      <DailyLogPanel />

      <DailyHistoryPanel />

      <footer className="page-footer">
        <span>Pulseboard</span>
        <p>데이터는 각 공급자 API의 제공 범위와 갱신 주기를 따릅니다.</p>
      </footer>
    </main>
  );
}
