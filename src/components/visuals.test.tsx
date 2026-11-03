import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DailyLogEntry } from "@/lib/history/daily-log";
import type { WidgetPayload } from "@/types/widget";
import { buildBriefing } from "./briefing";
import { Sparkline } from "./sparkline";
import { TrendChart } from "./trend-chart";
import { WidgetCard } from "./widget-card";

function entry(date: string, latest: number, min = latest, max = latest): DailyLogEntry {
  return {
    id: `k:${date}`, metricKey: "k", label: "서울 기온", unit: "°C", date,
    first: latest, latest, min, max, samples: 2,
    firstAt: `${date}T01:00:00.000Z`, updatedAt: `${date}T02:00:00.000Z`, lastFetchedAt: `${date}T02:00:00.000Z`,
  };
}

const source = { provider: "t", docsUrl: "https://example.com", endpointTemplate: "GET /t" };
function payload(facts: Record<string, number>, subline?: string): WidgetPayload {
  return { value: { headline: "x", subline, facts }, status: "ok", source, fetchedAt: "2026-11-03T00:00:00.000Z", cacheAgeMs: 0 };
}

describe("시각화 컴포넌트", () => {
  it("스파크라인: 2개 이상이면 선, 1개면 점만 그린다", () => {
    const { container, rerender } = render(<Sparkline values={[1, 3, 2]} label="추세" />);
    expect(container.querySelector("polyline")).not.toBeNull();
    rerender(<Sparkline values={[5]} label="추세" />);
    expect(container.querySelector("polyline")).toBeNull();
    expect(container.querySelector("circle")).not.toBeNull();
  });

  it("추세 차트: 날짜마다 툴팁 점을 만들고 빈 기록은 안내 문구를 보인다", () => {
    const { container, rerender } = render(
      <TrendChart series={[entry("2026-11-01", 10, 8, 12), entry("2026-11-02", 14, 9, 15)]} unit="°C" label="서울 기온" />,
    );
    expect(screen.getByRole("img", { name: /서울 기온 날짜별 추세 차트, 2일/ })).toBeInTheDocument();
    expect(container.querySelectorAll(".trend-chart__point")).toHaveLength(2);
    expect(container.querySelector("title")?.textContent).toContain("2026-11-01");
    rerender(<TrendChart series={[]} unit="°C" label="서울 기온" />);
    expect(screen.getByText("선택한 지표의 기록이 없습니다.")).toBeInTheDocument();
  });

  it("위젯 카드: history가 있으면 날짜별 기록 스트립(오늘 범위·표본)을 보여준다", () => {
    render(
      <WidgetCard
        icon="☁" name="서울 날씨" data={payload({})}
        history={[entry("2026-11-02", 9), entry("2026-11-03", 12, 8, 15)]}
      />,
    );
    const strip = screen.getByLabelText("서울 날씨 날짜별 기록");
    expect(strip).toHaveTextContent("최근 2일");
    expect(strip).toHaveTextContent("11-03 · 8~15 °C · 2회 기록");
  });

  it("위젯 카드: 기록이 아직 없으면 대기 문구, history가 없으면 스트립 자체를 숨긴다", () => {
    const { rerender } = render(<WidgetCard icon="☁" name="서울 날씨" data={payload({})} history={[]} />);
    expect(screen.getByText("기록 대기 중")).toBeInTheDocument();
    rerender(<WidgetCard icon="☁" name="서울 날씨" data={payload({})} />);
    expect(screen.queryByLabelText("서울 날씨 날짜별 기록")).toBeNull();
  });
});

describe("오늘 브리핑", () => {
  it("예보·대기질·공휴일 값으로 우산·자외선·미세먼지 판단과 색조를 만든다", () => {
    const tiles = buildBriefing(
      payload({ tmax: 18, tmin: 5, uvMax: 7, precipProbability: 70 }),
      payload({ pm25: 80, pm10: 120 }),
      payload({ daysUntil: 3 }, "추석 · 2026-11-06 (금)"),
    );
    const by = Object.fromEntries(tiles.map((tile) => [tile.label, tile]));
    expect(by["우산"]).toMatchObject({ value: "챙기세요", tone: "bad" });
    expect(by["자외선"]).toMatchObject({ value: "높음", tone: "bad" });
    expect(by["미세먼지"]).toMatchObject({ value: "매우 나쁨", tone: "bad" });
    expect(by["오늘 기온"]).toMatchObject({ value: "18° / 5°", note: "일교차 13°", tone: "warn" });
    expect(by["다음 공휴일"]).toMatchObject({ value: "D-3", tone: "good" });
  });

  it("데이터가 없으면 모든 타일이 '확인 중'(idle)이다", () => {
    const tiles = buildBriefing(undefined, undefined, undefined);
    expect(tiles).toHaveLength(5);
    expect(tiles.every((tile) => tile.value === "확인 중" && tile.tone === "idle")).toBe(true);
  });
});
