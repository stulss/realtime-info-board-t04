import { NextResponse } from "next/server";
import type { DailyHistoryResponse } from "@/lib/history/daily-records";
import { fetchUpbitDailyHistory } from "@/lib/providers/upbit";

const TTL_MS = 5 * 60_000;
let cached: { data: DailyHistoryResponse; expiresAt: number } | undefined;
let inFlight: Promise<DailyHistoryResponse> | undefined;

async function loadHistory(): Promise<DailyHistoryResponse> {
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  inFlight ??= fetchUpbitDailyHistory()
    .then((data) => {
      cached = { data, expiresAt: Date.now() + TTL_MS };
      return data;
    })
    .finally(() => { inFlight = undefined; });
  return inFlight;
}

export async function GET() {
  try {
    return NextResponse.json(await loadHistory(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "일별 기록을 가져오지 못했습니다." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
