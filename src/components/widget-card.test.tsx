import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { verificationFixtures } from "@/fixtures/widgets";
import { WidgetCard } from "./widget-card";

describe("WidgetCard", () => {
  it("값, 상태 텍스트, 출처, 원천/조회 시각을 함께 표시한다", () => {
    vi.useFakeTimers();
    const fixture = verificationFixtures[2];
    render(<WidgetCard icon={fixture.icon} name={fixture.name} data={fixture.data} />);

    expect(screen.getByText("₩164,830,000")).toBeInTheDocument();
    expect(screen.getByLabelText("상태: 정상")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upbit/ })).toHaveAttribute("href", fixture.data.source.docsUrl);
    expect(screen.getByText("원천 시각")).toBeInTheDocument();
    expect(screen.getByText("조회 시각")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("공급자가 원천 시각을 주지 않으면 API 미제공으로 표시한다", () => {
    vi.useFakeTimers();
    const fixture = verificationFixtures[0];
    render(<WidgetCard icon={fixture.icon} name={fixture.name} data={fixture.data} />);
    expect(screen.getByText("API 미제공")).toBeInTheDocument();
    expect(screen.getByText("점검 공지 확인")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("오래된 데이터의 장애 종류와 다시 시도 행동을 함께 표시한다", () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn();
    const fixture = verificationFixtures[2];
    render(
      <WidgetCard
        icon={fixture.icon}
        name={fixture.name}
        data={{
          ...fixture.data,
          status: "stale",
          lastError: {
            kind: "unauthorized",
            message: "인증에 실패했습니다.",
            occurredAt: "2026-08-27T00:00:00.000Z",
          },
        }}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByLabelText("상태: 오래된 데이터")).toBeInTheDocument();
    expect(screen.getByText("장애 유형: 인증 실패")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `${fixture.name} 새로고침` }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText("다시 시도")).toBeInTheDocument();
    vi.useRealTimers();
  });
});
