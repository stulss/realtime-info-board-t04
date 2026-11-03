import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { compareToPrevious, type DailyLogEntry } from "@/lib/history/daily-log";
import type { WidgetPayload } from "@/types/widget";
import { WidgetTile } from "./widget-tile";

function entry(date: string, latest: number): DailyLogEntry {
  return {
    id: `k:${date}`, metricKey: "k", label: "서울 기온", unit: "°C", date,
    first: latest, latest, min: latest - 1, max: latest + 1, samples: 3,
    firstAt: `${date}T01:00:00.000Z`, updatedAt: `${date}T02:00:00.000Z`, lastFetchedAt: `${date}T02:00:00.000Z`,
  };
}

const source = { provider: "Open-Meteo", docsUrl: "https://open-meteo.com", endpointTemplate: "GET /v1/forecast" };
const okData: WidgetPayload = {
  value: {
    headline: "15.1°C", subline: "서울 · 구름 조금",
    metric: { key: "k", label: "서울 기온", value: 15.1, unit: "°C" },
    details: [{ label: "습도", value: "67%" }],
  },
  status: "ok", source, fetchedAt: "2026-11-03T06:00:00.000Z", sourceTimestamp: "2026-11-03T06:00:00.000Z", cacheAgeMs: 0,
};

describe("compareToPrevious", () => {
  it("직전 다른 날짜 기록과의 차이·퍼센트·방향을 계산한다", () => {
    const result = compareToPrevious([entry("2026-11-01", 10), entry("2026-11-02", 12.5), entry("2026-11-03", 14)], 15);
    expect(result).toMatchObject({ previousDate: "2026-11-02", diff: 2.5, direction: "up" });
    expect(result?.percent).toBeCloseTo(20);
  });
  it("기록이 1건뿐이거나 이전값이 0이면 안전하게 처리한다", () => {
    expect(compareToPrevious([entry("2026-11-03", 5)], 6)).toBeNull();
    expect(compareToPrevious([entry("2026-11-02", 0), entry("2026-11-03", 1)], 3)?.percent).toBeNull();
  });
});

describe("WidgetTile (점진적 공개)", () => {
  it("처음에는 핵심 값·상태·직전 대비만 보이고 세부 항목은 접혀 있다", () => {
    render(<WidgetTile icon="☁" name="서울 날씨" data={okData} history={[entry("2026-11-02", 12), entry("2026-11-03", 14)]} onRefresh={() => {}} />);
    expect(screen.getByText("15.1°C")).toBeInTheDocument();
    expect(screen.getByLabelText("상태: 정상")).toBeInTheDocument();
    expect(screen.getByText(/상승 \+26%/)).toBeInTheDocument(); // 12 → 15.1 (+25.8%, 10% 이상은 정수 반올림)
    expect(screen.getByText("11-02 대비")).toBeInTheDocument();
    expect(screen.queryByText("습도")).toBeNull();
    expect(screen.queryByText("원천 시각")).toBeNull();
  });

  it("'상세'를 누르면 세부 항목·오늘 범위·원천/조회 시각·출처가 펼쳐진다", () => {
    render(<WidgetTile icon="☁" name="서울 날씨" data={okData} history={[entry("2026-11-03", 14)]} />);
    const toggle = screen.getByRole("button", { name: /상세/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("습도")).toBeInTheDocument();
    expect(screen.getByText("원천 시각")).toBeInTheDocument();
    expect(screen.getByText("조회 시각")).toBeInTheDocument();
    expect(screen.getByText(/오늘\(11-03\) 범위 · 3회 기록/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open-Meteo/ })).toHaveAttribute("href", "https://open-meteo.com");
  });

  it("값이 없으면 장애 유형을 한 줄로 바로 보여주고 상세 토글은 숨긴다", () => {
    const empty: WidgetPayload = {
      value: null, status: "error", source, fetchedAt: "", cacheAgeMs: 0,
      lastError: { kind: "unauthorized", message: "DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.", occurredAt: "2026-11-03T06:00:00.000Z" },
    };
    render(<WidgetTile icon="≋" name="에어코리아" data={empty} />);
    expect(screen.getByText("인증 실패")).toBeInTheDocument();
    expect(screen.getByText(/DATA_GO_KR_SERVICE_KEY/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /상세/ })).toBeNull();
  });

  it("오래된 데이터는 접지 않고 경고를 바로 노출한다", () => {
    const stale: WidgetPayload = { ...okData, status: "stale", warning: "최신 조회에 실패해 마지막 성공값을 표시합니다.", lastError: { kind: "timeout", message: "시간 초과", occurredAt: "2026-11-03T06:01:00.000Z" } };
    render(<WidgetTile icon="☁" name="서울 날씨" data={stale} />);
    expect(screen.getByRole("status")).toHaveTextContent("응답 시간 초과");
    expect(screen.getByLabelText("상태: 오래된 데이터")).toBeInTheDocument();
  });

  it("새로고침 버튼은 누르면 10초간 비활성화된다", () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn();
    render(<WidgetTile icon="☁" name="서울 날씨" data={okData} onRefresh={onRefresh} />);
    const button = screen.getByRole("button", { name: "서울 날씨 새로고침" });
    fireEvent.click(button);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
