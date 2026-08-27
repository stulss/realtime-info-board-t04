import Link from "next/link";
import { WidgetCard } from "@/components/widget-card";
import { verificationFixtures } from "@/fixtures/widgets";
import { FailureVerification } from "@/components/failure-verification";

const T04_CARDS = [
  ["카드 1", "값의 맥락", "현재값·단위·출처·조회 시각을 한 화면에서 확인"],
  ["카드 2", "비밀키와 호출 경로", "출처 링크와 자체 API 경로, 비밀값 0건 확인"],
  ["카드 3", "실패를 구분해 보여주기", "장애 5종·마지막 정상값·오래된 데이터·복구 확인"],
  ["카드 4", "하루 한 번 기록", "Asia/Seoul 날짜별 한 건과 중복 방지 확인"],
  ["카드 5", "어제와 비교 검증", "이전값·현재값·차이·방향·단위 확인"],
] as const;

export default function VerificationPage() {
  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">P</span><span>Pulseboard</span></div>
        <Link className="text-link" href="/">실시간 화면으로 돌아가기 →</Link>
      </header>
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">VISUAL VERIFICATION</p>
          <h1>T04 상태별 카드 검증</h1>
          <p className="hero-copy">과제 카드 5개를 순서대로 읽고 장애 재현과 복구를 공개 화면에서 확인합니다.</p>
        </div>
      </section>

      <section aria-labelledby="task-card-heading">
        <div className="section-heading"><div><span>00</span><h2 id="task-card-heading">과제 카드 순서</h2></div></div>
        <ol className="task-card-list">
          {T04_CARDS.map(([number, title, goal]) => (
            <li key={number}><span>{number}</span><h3>{title}</h3><p>{goal}</p></li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="fixture-heading">
        <div className="section-heading"><div><span>01</span><h2 id="fixture-heading">기존 상태 회귀 검증</h2></div></div>
        <div className="widget-grid" aria-label="상태별 검증 위젯">
        {verificationFixtures.map((widget) => (
          <WidgetCard key={widget.id} icon={widget.icon} name={widget.name} data={widget.data} />
        ))}
        </div>
      </section>

      <FailureVerification />
    </main>
  );
}
