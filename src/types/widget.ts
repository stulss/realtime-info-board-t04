export type WidgetStatus =
  | "ok"
  | "refreshing"
  | "stale"
  | "maintenance"
  | "rate_limited"
  | "error";

export type WidgetFailureKind =
  | "timeout"
  | "unauthorized"
  | "rate_limited"
  | "offline"
  | "schema_changed"
  | "provider_error";

export type WidgetData<T> = {
  value: T;
  status: WidgetStatus;
  source: {
    provider: string;
    docsUrl: string;
    endpointTemplate: string;
    attribution?: string;
  };
  sourceTimestamp?: string;
  fetchedAt: string;
  nextRefreshAt?: string;
  cacheAgeMs: number;
  warning?: string;
  lastError?: {
    kind?: WidgetFailureKind;
    code?: number;
    message: string;
    occurredAt: string;
  };
};

export type WidgetMetric = {
  key: string;
  label: string;
  value: number;
  unit: string;
};

export type WidgetValue = {
  headline: string;
  /** 날짜별 기록에 저장할 대표 수치(선택). 없으면 기록하지 않는다. */
  metric?: WidgetMetric;
  /** 브리핑 등 화면 조합용 기계 판독 값(선택). 표시 문구 파싱을 피하려고 둔다. */
  facts?: Record<string, number>;
  /** 지도·3D 지구본용 좌표 목록(선택). value는 규모 같은 크기 값. */
  points?: Array<{ lat: number; lon: number; value: number; label: string; at?: string }>;
  subline?: string;
  trend?: "up" | "down" | "flat";
  details?: Array<{ label: string; value: string }>;
};

export type WidgetPayload = WidgetData<WidgetValue | null>;
