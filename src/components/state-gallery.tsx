"use client";

import { useEffect, useState } from "react";
import { buildStateFixtures, type StateFixture } from "@/fixtures/widgets";
import { WidgetCard } from "./widget-card";

/** 상태별 카드 5종. 시각을 "지금" 기준으로 만들기 위해 마운트 후에 그린다(자리는 미리 잡아 화면이 밀리지 않게 한다). */
export function StateGallery() {
  const [fixtures, setFixtures] = useState<StateFixture[] | null>(null);
  useEffect(() => { queueMicrotask(() => setFixtures(buildStateFixtures())); }, []);

  return (
    <div className="widget-grid state-gallery" aria-label="상태별 검증 위젯" aria-busy={!fixtures}>
      {fixtures?.map((widget) => (
        <WidgetCard key={widget.id} icon={widget.icon} name={widget.name} data={widget.data} />
      ))}
    </div>
  );
}
