import { NextResponse } from "next/server";
import { resolvePlace } from "@/lib/providers/place";

/** 좌표(소수 둘째 자리)를 지명으로 바꾼다. 좌표는 저장하지 않는다. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (!params.get("lat") || !params.get("lon") || !Number.isFinite(lat) || !Number.isFinite(lon)
    || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "lat, lon 값이 올바르지 않습니다." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const place = await resolvePlace(Math.round(lat * 100) / 100, Math.round(lon * 100) / 100);
  return NextResponse.json(place, { headers: { "Cache-Control": "no-store" } });
}
