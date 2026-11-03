"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { placeQuery } from "@/lib/location";
import { recordDailyCloses } from "@/lib/history/daily-log";
import { fetchHistoryCloses } from "@/lib/history/history-client";
import { fetchUpbitCloses } from "@/lib/history/upbit-closes";
import { useLocation } from "./location-provider";

/**
 * 화면에는 아무것도 그리지 않고 날짜별 기록을 자동으로 채운다.
 * - 시작일(8월 1일)부터 어제까지: 공급자의 과거 원자료(기온·대기질·지진·Kp·ETH·환율·BTC 일봉)
 * - 오늘부터: 각 위젯이 정상 조회될 때마다 실시간으로 저장(DashboardWidget)
 * 같은 날짜는 항상 한 줄이라 여러 번 실행해도 중복되지 않는다.
 */
export function DailyCloseSync() {
  const { place } = useLocation();
  const locQuery = placeQuery(place);

  const upbit = useQuery({
    queryKey: ["daily-closes", "KRW-BTC"],
    queryFn: fetchUpbitCloses,
    staleTime: 5 * 60_000,
    refetchInterval: 60 * 60_000,
    retry: false,
  });
  const history = useQuery({
    queryKey: ["history-backfill", locQuery],
    queryFn: () => fetchHistoryCloses(locQuery),
    staleTime: 60 * 60_000,
    refetchInterval: 6 * 60 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (upbit.data && upbit.data.length > 0) recordDailyCloses(upbit.data);
  }, [upbit.data]);

  useEffect(() => {
    if (history.data && history.data.closes.length > 0) recordDailyCloses(history.data.closes);
  }, [history.data]);

  return null;
}
