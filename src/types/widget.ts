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

export type WidgetValue = {
  headline: string;
  subline?: string;
  trend?: "up" | "down" | "flat";
  details?: Array<{ label: string; value: string }>;
};

export type WidgetPayload = WidgetData<WidgetValue | null>;
