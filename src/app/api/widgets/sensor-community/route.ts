import { fetchSensorCommunity, sensorCommunitySource } from "@/lib/providers/sensor-community";
import { createWidgetRoute } from "@/lib/server/widget-route";

export const GET = createWidgetRoute("sensor-community", sensorCommunitySource, 5 * 60_000, fetchSensorCommunity);
