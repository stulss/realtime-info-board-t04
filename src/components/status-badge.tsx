import type { WidgetStatus } from "@/types/widget";

const STATUS_META: Record<WidgetStatus, { icon: string; label: string }> = {
  ok: { icon: "●", label: "정상" },
  refreshing: { icon: "↻", label: "갱신 중" },
  stale: { icon: "◷", label: "오래된 데이터" },
  maintenance: { icon: "◆", label: "점검 중" },
  rate_limited: { icon: "!", label: "호출 제한" },
  error: { icon: "×", label: "조회 실패" },
};

export function StatusBadge({ status }: { status: WidgetStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`status-badge status-${status}`} aria-label={`상태: ${meta.label}`}>
      <span aria-hidden="true">{meta.icon}</span>
      {meta.label}
    </span>
  );
}
