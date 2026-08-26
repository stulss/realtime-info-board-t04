"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { WidgetPayload } from "@/types/widget";
import {
  DEFAULT_EXCHANGE_CURRENCY,
  DEFAULT_MARKET_ITEM_NAME,
  EXCHANGE_CURRENCIES,
  normalizeMarketItemName,
  type ExchangeCurrency,
} from "@/lib/widget-options";
import { WidgetCard } from "./widget-card";

const WIDGETS = [
  { id: "lostark-notices", name: "로스트아크 공지", icon: "⚔", interval: 15 * 60_000 },
  { id: "lostark-market", name: "로스트아크 거래장", icon: "◇", interval: 5 * 60_000 },
  { id: "upbit-ticker", name: "비트코인", icon: "₿", interval: 20_000 },
  { id: "exchange-rate", name: "원·달러 고시환율", icon: "₩", interval: 60 * 60_000 },
  { id: "status", name: "GitHub 서비스 상태", icon: "◉", interval: 5 * 60_000 },
] as const;

async function fetchWidget(requestPath: string): Promise<WidgetPayload> {
  const response = await fetch(requestPath);
  const data = (await response.json()) as WidgetPayload;
  if (!response.ok && !data.lastError) throw new Error("위젯 응답 형식이 올바르지 않습니다.");
  return data;
}

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
    queryFn: () => fetchWidget(requestPath),
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState === "hidden"
        ? widget.interval * 4
        : widget.interval,
  });

  const fallback: WidgetPayload = {
    value: null,
    status: "error",
    source: { provider: widget.name, docsUrl: "#", endpointTemplate: `/api/widgets/${widget.id}` },
    fetchedAt: "",
    cacheAgeMs: 0,
    warning: query.error instanceof Error ? query.error.message : "데이터를 불러오는 중입니다.",
  };

  return (
    <WidgetCard
      icon={widget.icon}
      name={widget.name}
      data={query.data ?? fallback}
      isRefreshing={query.isFetching}
      onRefresh={() => void query.refetch()}
      controls={controls}
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
  const [marketDraft, setMarketDraft] = useState(DEFAULT_MARKET_ITEM_NAME);
  const [marketItem, setMarketItem] = useState(DEFAULT_MARKET_ITEM_NAME);

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

  function searchMarket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMarketItem(normalizeMarketItemName(marketDraft));
  }

  const marketWidget = WIDGETS.find(({ id }) => id === "lostark-market")!;
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

      <section className="section-heading">
        <div><span>01</span><h2>내 정보판</h2></div>
        <p>5개의 신뢰 가능한 데이터 소스</p>
      </section>

      <section className="widget-grid" aria-label="실시간 정보 위젯">
        {WIDGETS.map((widget) => {
          if (widget.id === "lostark-market") {
            return (
              <DashboardWidget
                key={widget.id}
                widget={marketWidget}
                requestPath={`/api/widgets/lostark-market?itemName=${encodeURIComponent(marketItem)}`}
                controls={(
                  <form className="widget-search" onSubmit={searchMarket} aria-label="로스트아크 거래장 아이템 검색">
                    <label htmlFor="market-item-name">아이템 검색</label>
                    <div>
                      <input
                        id="market-item-name"
                        value={marketDraft}
                        onChange={(event) => setMarketDraft(event.target.value)}
                        maxLength={50}
                        autoComplete="off"
                      />
                      <button type="submit">검색</button>
                    </div>
                  </form>
                )}
              />
            );
          }
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
      </section>

      <footer className="page-footer">
        <span>Pulseboard</span>
        <p>데이터는 각 공급자 API의 제공 범위와 갱신 주기를 따릅니다.</p>
      </footer>
    </main>
  );
}
