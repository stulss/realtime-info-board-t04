import { fetchUsgsEarthquakes, usgsSource } from "@/lib/providers/usgs";
import { createWidgetRoute } from "@/lib/server/widget-route";

export const GET = createWidgetRoute("usgs-earthquake", usgsSource, 5 * 60_000, fetchUsgsEarthquakes);
