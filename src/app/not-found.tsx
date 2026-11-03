import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "페이지를 찾을 수 없어요" };

export default function NotFound() {
  return (
    <main id="main" className="state-page">
      <p className="eyebrow">404</p>
      <h1>찾는 페이지가 없습니다</h1>
      <p>주소가 바뀌었거나 잘못 입력되었을 수 있어요.</p>
      <div className="state-page__actions">
        <Link href="/">정보판으로 돌아가기</Link>
        <Link href="/about">데이터 출처 보기</Link>
      </div>
    </main>
  );
}
