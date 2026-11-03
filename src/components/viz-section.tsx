"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useDailyLog } from "@/lib/history/use-daily-log";

/** three.js(약 600KB)는 이 섹션이 보일 때만 내려받는다. */
function Skeleton({ label }: { label: string }) {
  return (
    <div className="viz3d viz3d--loading" role="status" aria-live="polite">
      <div className="viz3d__stage"><span className="viz3d__spinner" aria-hidden="true" />{label}</div>
    </div>
  );
}

const Bars3D = dynamic(() => import("./three/bars-3d").then((module) => module.Bars3D), {
  ssr: false,
  loading: () => <Skeleton label="3D 지형 불러오는 중…" />,
});
const Globe3D = dynamic(() => import("./three/globe-3d").then((module) => module.Globe3D), {
  ssr: false,
  loading: () => <Skeleton label="3D 지구본 불러오는 중…" />,
});

const TABS = [
  { id: "terrain", title: "날짜 × 지표 3D 지형", desc: "기록된 모든 지표를 지표별 0~100%로 정규화해 한 장면에 쌓았습니다." },
  { id: "globe", title: "3D 지구본", desc: "최근 24시간 지진과 ISS, 내 위치를 지구 위에서 봅니다." },
] as const;

export function VizSection({ onPickDate }: { onPickDate?: (date: string) => void }) {
  const entries = useDailyLog();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("terrain");
  const active = TABS.find((item) => item.id === tab)!;

  return (
    <section className="viz-section" aria-labelledby="viz-heading">
      <div className="section-heading">
        <div><span>02</span><h2 id="viz-heading">3D 데이터 시각화</h2></div>
        <div className="filter-chips" role="tablist" aria-label="3D 보기">
          {TABS.map((item) => (
            <button key={item.id} type="button" role="tab" className="filter-chip" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
              {item.title}
            </button>
          ))}
        </div>
      </div>
      <p className="viz-section__desc">{active.desc}</p>
      {tab === "terrain" ? <Bars3D entries={entries} onPickDate={onPickDate} /> : <Globe3D />}
    </section>
  );
}
