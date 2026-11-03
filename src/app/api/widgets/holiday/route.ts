import { fetchNextHoliday, holidaySource } from "@/lib/providers/forecast-extras";
import { createWidgetRoute } from "@/lib/server/widget-route";

// D-day는 날짜가 바뀌면 달라지므로 1시간 TTL로 자정 이후 늦어도 1시간 안에 반영한다.
export const GET = createWidgetRoute("holiday", holidaySource, 60 * 60_000, () => fetchNextHoliday());
