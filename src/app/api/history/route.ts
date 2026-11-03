import { NextResponse } from "next/server";
import { parsePlace } from "@/lib/location";
import { getHistory } from "@/lib/providers/history";
import { ProviderHttpError } from "@/lib/server/http";

/** 시작일(기본 2026-08-01)부터 어제까지의 과거 일별 값. 오늘부터는 클라이언트가 실시간으로 쌓는다. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const place = parsePlace(params);
    const data = await getHistory(place, params.get("from"));
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof ProviderHttpError && error.status === 400 ? 400 : 503;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "과거 기록을 가져오지 못했습니다." },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
