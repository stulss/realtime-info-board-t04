"use client";

import Link from "next/link";

/** 화면 렌더링 중 예기치 못한 오류가 나도 빈 화면 대신 복구 경로를 보여 준다. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="state-page" role="alert">
      <p className="eyebrow">문제가 발생했어요</p>
      <h1>화면을 불러오지 못했습니다</h1>
      <p>일시적인 오류일 수 있어요. 다시 시도해도 같으면 잠시 뒤에 다시 열어 주세요. 저장된 날짜별 기록은 이 브라우저에 그대로 남아 있습니다.</p>
      {error.digest && <p className="state-page__code">오류 코드 {error.digest}</p>}
      <div className="state-page__actions">
        <button type="button" onClick={reset}>다시 시도</button>
        <Link href="/">처음으로</Link>
      </div>
    </main>
  );
}
