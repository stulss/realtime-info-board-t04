"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { DailyLogEntry } from "@/lib/history/daily-log";
import { buildBarGrid, type BarCell, type BarMetric } from "@/lib/viz/bars";
import { createStage, hasWebGL, makeLabel, prefersReducedMotion, readTheme, type Stage } from "./stage";

const DX = 0.34; // 날짜 간격
const DZ = 1.05; // 지표 간격
const BAR_W = 0.26;
const BAR_D = 0.5;
const H_MAX = 3.4;
const GROW_MS = 750;

type Props = {
  entries: DailyLogEntry[];
  /** 막대를 누르면 그 날짜의 기록으로 이동한다. */
  onPickDate?: (date: string) => void;
};

type Tip = { x: number; y: number; w: number; cell: BarCell; metric: BarMetric };

const fmt = (value: number) => new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);

export function Bars3D({ entries, onPickDate }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const presetsRef = useRef<Record<"default" | "top" | "front", THREE.Vector3> | undefined>(undefined);
  const pickRef = useRef(onPickDate);
  const [supported] = useState(() => hasWebGL());
  const [tip, setTip] = useState<Tip | null>(null);
  const [rotating, setRotating] = useState(() => !prefersReducedMotion());
  const [themeKey, setThemeKey] = useState(0);

  useEffect(() => { pickRef.current = onPickDate; }, [onPickDate]);

  const grid = useMemo(() => buildBarGrid(entries, { maxDates: 90, maxMetrics: 8 }), [entries]);

  // 테마(라이트/다크) 전환 시 색을 다시 읽어 장면을 새로 만든다.
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeKey((value) => value + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!supported || !host || grid.cells.length === 0) return;
    const theme = readTheme();
    const reduced = prefersReducedMotion();
    const nDates = grid.dates.length;
    const nMetrics = grid.metrics.length;
    const width = (nDates - 1) * DX;
    const depth = (nMetrics - 1) * DZ;
    // 기록이 적거나 화면이 세로로 길어도 장면 전체가 보이도록 카메라 거리를 보정한다.
    const aspect = host.clientWidth / Math.max(1, host.clientHeight);
    const fit = aspect < 1.25 ? Math.min(2.2, 1.25 / Math.max(0.4, aspect)) : 1;
    const radius = Math.max(width, depth, 6) * 0.95 * fit;

    const presets = {
      default: new THREE.Vector3(radius * 0.55, radius * 0.62, radius * 0.95),
      top: new THREE.Vector3(0.001, radius * 1.35, 0.4),
      front: new THREE.Vector3(-radius * 0.32, radius * 0.4, radius * 1.15),
    };
    presetsRef.current = presets;

    const growStart = performance.now();
    let growing = !reduced;
    const stage = createStage(host, {
      position: presets.default.toArray() as [number, number, number],
      target: [0, 1.1, 0],
      autoRotate: rotating,
      autoRotateSpeed: 0.45,
      minDistance: 3,
      maxDistance: radius * 3,
      maxPolarAngle: Math.PI * 0.49,
      isAnimating: () => growing,
      onFrame: (now) => { if (growing) updateMatrices(now); },
    });
    stageRef.current = stage;
    const { scene } = stage;

    scene.add(new THREE.AmbientLight(0xffffff, theme.dark ? 0.85 : 1.05));
    const sun = new THREE.DirectionalLight(0xffffff, theme.dark ? 1.4 : 1.7);
    sun.position.set(radius * 0.6, radius * 1.2, radius * 0.7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const span = Math.max(width, depth) * 0.75 + 2;
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 0.5, far: radius * 4 });
    sun.shadow.bias = -0.0004;
    sun.shadow.radius = 4;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xffffff, new THREE.Color(theme.line), 0.35));

    // 바닥 + 지표 행 구분선
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 2.4, depth + 2.4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.surface), transparent: true, opacity: theme.dark ? 0.55 : 0.8 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.005;
    scene.add(floor);
    const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(width + 2.4, depth + 2.4), new THREE.ShadowMaterial({ opacity: theme.dark ? 0.5 : 0.22 }));
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.y = 0.002;
    shadowCatcher.receiveShadow = true;
    scene.add(shadowCatcher);

    // 높이 눈금(0 / 50 / 100%): 뒷벽에 옅은 가이드선
    const guide: number[] = [];
    for (const fraction of [0.5, 1]) {
      const y = 0.07 + fraction * H_MAX;
      guide.push(-width / 2 - 0.5, y, -depth / 2 - 0.55, width / 2 + 0.5, y, -depth / 2 - 0.55);
    }
    guide.push(-width / 2 - 0.5, 0, -depth / 2 - 0.55, -width / 2 - 0.5, 0.07 + H_MAX, -depth / 2 - 0.55);
    const guideGeometry = new THREE.BufferGeometry();
    guideGeometry.setAttribute("position", new THREE.Float32BufferAttribute(guide, 3));
    scene.add(new THREE.LineSegments(guideGeometry, new THREE.LineBasicMaterial({ color: new THREE.Color(theme.line), transparent: true, opacity: 0.9 })));
    for (const [text, fraction] of [["0%", 0], ["50%", 0.5], ["100%", 1]] as const) {
      const tick = makeLabel(text, theme.muted, 22, 0.28);
      tick.position.set(-width / 2 - 0.5 - tick.scale.x / 2 - 0.08, 0.07 + fraction * H_MAX, -depth / 2 - 0.55);
      scene.add(tick);
    }
    const lines: number[] = [];
    for (let z = 0; z < nMetrics; z += 1) {
      const zz = (z - (nMetrics - 1) / 2) * DZ;
      lines.push(-width / 2 - 0.5, 0, zz, width / 2 + 0.5, 0, zz);
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    scene.add(new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: new THREE.Color(theme.line), transparent: true, opacity: 0.9 })));

    // 막대(InstancedMesh)
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    boxGeometry.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(boxGeometry, new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.08 }), grid.cells.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const base = new THREE.Object3D();
    const heights = grid.cells.map((cell) => 0.07 + cell.norm * H_MAX);
    const positions = grid.cells.map((cell) => new THREE.Vector3((cell.x - (nDates - 1) / 2) * DX, 0, (cell.z - (nMetrics - 1) / 2) * DZ));
    grid.cells.forEach((cell, index) => {
      const color = new THREE.Color(grid.metrics[cell.z].color);
      color.offsetHSL(0, 0, (cell.norm - 0.5) * 0.16);
      if (!cell.closed) color.offsetHSL(0, 0.08, 0.04); // 오늘부터의 실시간 기록은 살짝 선명하게
      mesh.setColorAt(index, color);
    });
    function updateMatrices(now: number) {
      let done = true;
      grid.cells.forEach((cell, index) => {
        const progress = reduced ? 1 : Math.min(1, Math.max(0, (now - growStart - cell.x * 9) / GROW_MS));
        if (progress < 1) done = false;
        const eased = 1 - Math.pow(1 - progress, 3);
        base.position.copy(positions[index]);
        base.scale.set(BAR_W, Math.max(0.001, heights[index] * eased), BAR_D);
        base.updateMatrix();
        mesh.setMatrixAt(index, base.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (done) growing = false;
    }
    updateMatrices(growStart);
    if (reduced) growing = false;
    scene.add(mesh);

    // 호버 강조 테두리
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
      new THREE.LineBasicMaterial({ color: new THREE.Color(theme.ink) }),
    );
    outline.visible = false;
    scene.add(outline);

    // 축 라벨
    const clip = (text: string) => (text.length > 13 ? `${text.slice(0, 12)}…` : text);
    grid.metrics.forEach((metric, index) => {
      const label = makeLabel(clip(metric.label), theme.ink, 30, 0.4);
      label.position.set(-width / 2 - 1.15 - label.scale.x / 2, 0.2, (index - (nMetrics - 1) / 2) * DZ);
      scene.add(label);
    });
    grid.dates.forEach((date, index) => {
      if (!(date.endsWith("-01") || index === nDates - 1)) return;
      const label = makeLabel(date.slice(5), theme.muted, 26, 0.36);
      label.position.set((index - (nDates - 1) / 2) * DX, 0.18, depth / 2 + 0.75);
      scene.add(label);
    });

    // 상호작용: 호버(툴팁) / 클릭(날짜 이동)
    const canvas = stage.renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pending = false;
    let downAt: { x: number; y: number } | null = null;
    let hovered = -1;

    function pick(clientX: number, clientY: number): { index: number; x: number; y: number; w: number } | null {
      const rect = canvas.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, stage.camera);
      const hit = raycaster.intersectObject(mesh)[0];
      return hit?.instanceId === undefined ? null : { index: hit.instanceId, x: clientX - rect.left, y: clientY - rect.top, w: rect.width };
    }
    function onMove(event: PointerEvent) {
      if (pending || event.buttons !== 0) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        const hit = pick(event.clientX, event.clientY);
        if (!hit) {
          if (hovered !== -1) { hovered = -1; outline.visible = false; setTip(null); stage.invalidate(); }
          canvas.style.cursor = "grab";
          return;
        }
        canvas.style.cursor = "pointer";
        const cell = grid.cells[hit.index];
        if (hit.index !== hovered) {
          hovered = hit.index;
          outline.visible = true;
          outline.position.copy(positions[hit.index]);
          outline.scale.set(BAR_W + 0.04, heights[hit.index] + 0.04, BAR_D + 0.04);
          stage.invalidate();
        }
        setTip({ x: hit.x, y: hit.y, w: hit.w, cell, metric: grid.metrics[cell.z] });
      });
    }
    function onLeave() {
      hovered = -1; outline.visible = false; setTip(null); stage.invalidate();
    }
    function onDown(event: PointerEvent) { downAt = { x: event.clientX, y: event.clientY }; }
    function onUp(event: PointerEvent) {
      if (!downAt) return;
      const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
      downAt = null;
      if (moved > 5) return; // 드래그(회전)는 클릭이 아니다
      const hit = pick(event.clientX, event.clientY);
      if (hit) pickRef.current?.(grid.cells[hit.index].date);
    }
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);

    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      stage.dispose();
      stageRef.current = null;
      setTip(null);
    };
    // rotating은 초기값으로만 사용하고 토글은 컨트롤에 직접 반영한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, grid, themeKey]);

  function go(preset: "default" | "top" | "front") {
    const stage = stageRef.current;
    const position = presetsRef.current?.[preset];
    if (stage && position) stage.flyTo(position, new THREE.Vector3(0, preset === "top" ? 0 : 1.1, 0));
  }

  function toggleRotate() {
    const stage = stageRef.current;
    const next = !rotating;
    setRotating(next);
    if (stage) { stage.controls.autoRotate = next; stage.invalidate(); }
  }

  if (!supported) {
    return <p className="viz-fallback" role="note">이 브라우저에서는 3D(WebGL)를 쓸 수 없어 아래 표와 2D 차트로 보여 드립니다.</p>;
  }
  if (grid.cells.length === 0) {
    return <p className="viz-fallback" role="note">기록이 2일 이상 쌓이면 날짜 × 지표 3D 지형이 나타납니다.</p>;
  }

  const summary = `날짜 ${grid.dates.length}일(${grid.dates[0]} ~ ${grid.dates[grid.dates.length - 1]}) × 지표 ${grid.metrics.length}개의 3D 막대 지형. 지표별로 0~100%로 정규화한 높이입니다.`;

  return (
    <div className="viz3d">
      <div className="viz3d__stage" ref={hostRef} role="img" aria-label={summary}>
        {tip && (
          <div className="viz3d__tip" style={{ left: Math.max(8, Math.min(tip.x + 14, tip.w - 230)), top: Math.max(8, tip.y - 12) }} role="status">
            <strong>{tip.metric.label}</strong>
            <span>{tip.cell.date}{tip.cell.closed ? " · 과거 원자료" : " · 실시간"}</span>
            <b>{fmt(tip.cell.value)} {tip.metric.unit}</b>
            <small>최소 {fmt(tip.cell.min)} ~ 최대 {fmt(tip.cell.max)} · {Math.round(tip.cell.norm * 100)}% 위치</small>
          </div>
        )}
        <div className="viz3d__hint" aria-hidden="true">드래그로 회전 · 휠/핀치로 확대 · 막대를 누르면 그날 기록으로</div>
      </div>
      <div className="viz3d__bar">
        <ul className="viz-legend" aria-label="지표 범례">
          {grid.metrics.map((metric) => (
            <li key={metric.key}><i style={{ background: metric.color }} />{metric.label}</li>
          ))}
        </ul>
        <div className="viz3d__buttons" role="group" aria-label="시점">
          <button type="button" onClick={() => go("default")}>기본</button>
          <button type="button" onClick={() => go("top")}>위에서</button>
          <button type="button" onClick={() => go("front")}>정면</button>
          <button type="button" aria-pressed={rotating} onClick={toggleRotate}>자동 회전</button>
        </div>
      </div>
      <p className="sr-only">{summary}</p>
    </div>
  );
}
