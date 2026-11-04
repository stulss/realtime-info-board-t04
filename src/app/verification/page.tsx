import Link from "next/link";
import { StateGallery } from "@/components/state-gallery";
import { FailureVerification } from "@/components/failure-verification";

const PRINCIPLES = [
  ["원칙 1", "값에는 맥락을 붙인다", "현재값·단위·출처·조회 시각을 함께 보여 줍니다."],
  ["원칙 2", "비밀값은 서버에만 둔다", "브라우저는 우리 API만 부르고, 키는 응답에 담기지 않습니다."],
  ["원칙 3", "실패를 종류별로 구분한다", "시간 초과·인증·호출 제한을 다른 문구로 안내하고, 마지막 정상값은 '오래된 데이터'로 남깁니다."],
  ["원칙 4", "하루 한 번 자동으로 기록한다", "한국 시간 기준 날짜별 한 건만 남겨 중복 없이 쌓습니다."],
  ["원칙 5", "이전 값과 비교해 보여 준다", "차이·방향·단위를 함께 적어 변화를 바로 읽게 합니다."],
] as const;

export default function VerificationPage() {
  return (
    <main id="main" className="dashboard-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">D</span><span>Daylog</span></div>
        <Link className="text-link" href="/">실시간 화면으로 돌아가기 →</Link>
      </header>
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">RESILIENCE DEMO · 장애 대응 설계</p>
          <h1>장애 상태 시뮬레이터</h1>
          <p className="hero-copy">외부 API는 언제든 느려지거나 실패합니다. Daylog는 빈 화면 대신 원인을 알려 주고 마지막 정상값을 남깁니다. 아래에서 장애 5종을 직접 일으켜 보고, 다시 시도로 복구해 보세요. (실제 외부 API는 호출하지 않는 시뮬레이션입니다.)</p>
        </div>
      </section>

      <section aria-labelledby="task-card-heading">
        <div className="section-heading"><div><span>01</span><h2 id="task-card-heading">설계 원칙 5가지</h2></div></div>
        <ol className="task-card-list">
          {PRINCIPLES.map(([number, title, goal]) => (
            <li key={number}><span>{number}</span><h3>{title}</h3><p>{goal}</p></li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="fixture-heading">
        <div className="section-heading"><div><span>02</span><h2 id="fixture-heading">카드가 가질 수 있는 상태</h2></div></div>
        <StateGallery />
      </section>

      <FailureVerification />
    </main>
  );
}
