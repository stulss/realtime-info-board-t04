import Link from "next/link";
import { WidgetCard } from "@/components/widget-card";
import { verificationFixtures } from "@/fixtures/widgets";

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
          <h1>상태별 카드 검증</h1>
          <p className="hero-copy">정상·오래됨·점검·호출 제한·조회 실패 fixture를 한 화면에서 확인합니다.</p>
        </div>
      </section>
      <section className="widget-grid" aria-label="상태별 검증 위젯">
        {verificationFixtures.map((widget) => (
          <WidgetCard key={widget.id} icon={widget.icon} name={widget.name} data={widget.data} />
        ))}
      </section>
    </main>
  );
}
