import type { WidgetPayload } from "@/types/widget";
import { fetchJson } from "@/lib/server/http";

type StatusSummary = {
  page: { updated_at: string };
  status: { indicator: string; description: string };
  components: Array<{ status: string }>;
};

const STATUS_LABELS: Record<string, string> = {
  none: "모든 시스템 정상",
  minor: "일부 기능 성능 저하",
  major: "주요 장애 발생",
  critical: "심각한 장애 발생",
  maintenance: "예정된 점검 진행 중",
};

export const githubStatusSource: WidgetPayload["source"] = {
  provider: "GitHub Status",
  docsUrl: "https://www.githubstatus.com/api",
  endpointTemplate: "GET /api/v2/summary.json",
};

export async function fetchGithubStatus(): Promise<WidgetPayload> {
  const summary = await fetchJson<StatusSummary>("https://www.githubstatus.com/api/v2/summary.json");
  const affected = summary.components.filter((component) => component.status !== "operational").length;
  const fetchedAt = new Date().toISOString();
  return {
    value: {
      headline: STATUS_LABELS[summary.status.indicator] ?? summary.status.description,
      subline: "GitHub 공개 상태 페이지",
      details: [{ label: "영향받는 구성요소", value: `${affected}개` }],
    },
    status: summary.status.indicator === "maintenance" ? "maintenance" : "ok",
    source: githubStatusSource,
    sourceTimestamp: summary.page.updated_at,
    fetchedAt,
    nextRefreshAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    cacheAgeMs: 0,
  };
}
