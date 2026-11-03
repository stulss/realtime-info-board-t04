import { fetchSensorCommunity, sensorCommunitySource } from "@/lib/providers/sensor-community";
import { createPlaceRoute } from "@/lib/server/widget-route";

export const GET = createPlaceRoute("sensor-community", sensorCommunitySource, 5 * 60_000, fetchSensorCommunity);
