import type { WidgetPayload } from "@/types/widget";
import { getCachedWidget } from "./cache";
import { widgetResponse } from "./widget-response";

/** 단순 위젯(파라미터 없음) Route Handler를 한 줄로 만든다. */
export function createWidgetRoute(
  key: string,
  source: WidgetPayload["source"],
  ttlMs: number,
  loader: () => Promise<WidgetPayload>,
) {
  return function GET() {
    return widgetResponse(source, () => getCachedWidget(key, ttlMs, loader), ttlMs);
  };
}
