import { NextResponse } from "next/server";

/**
 * 어떤 공식 데이터 키가 설정돼 있는지 "여부만" 알려 준다(값은 절대 노출하지 않는다).
 * 클라이언트는 키가 없는 위젯을 요청하지 않아, 불필요한 503·콘솔 오류 없이 안내로 대체한다.
 */
export function GET() {
  return NextResponse.json(
    {
      dataGoKr: Boolean(process.env.DATA_GO_KR_SERVICE_KEY?.trim()),
      exim: Boolean(process.env.EXIM_SERVICE_KEY?.trim()),
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
