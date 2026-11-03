"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { recordDailyCloses } from "@/lib/history/daily-log";
import { fetchUpbitCloses } from "@/lib/history/upbit-closes";

/**
 * 화면에는 아무것도 그리지 않고, Upbit 확정 일봉 종가를 날짜별 자동 기록에 채운다.
 * 접속하지 않은 어제 같은 날도 공급자 원자료로 하루 한 줄이 생긴다.
 */
export function DailyCloseSync() {
  const { data } = useQuery({
    queryKey: ["daily-closes", "KRW-BTC"],
    queryFn: fetchUpbitCloses,
    staleTime: 5 * 60_000,
    refetchInterval: 60 * 60_000,
    retry: false,
  });

  useEffect(() => {
    if (data && data.length > 0) recordDailyCloses(data);
  }, [data]);

  return null;
}
