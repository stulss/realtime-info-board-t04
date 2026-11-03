import { fetchIssPosition, issSource } from "@/lib/providers/iss";
import { createWidgetRoute } from "@/lib/server/widget-route";

export const GET = createWidgetRoute("iss", issSource, 15_000, fetchIssPosition);
