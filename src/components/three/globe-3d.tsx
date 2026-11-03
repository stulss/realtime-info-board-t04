"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { fetchWidgetPayload } from "@/lib/client/widget-state";
import { latLonToVector, orbitPath, quakeColor, quakeHeight } from "@/lib/viz/globe";
import { useLocation } from "../location-provider";
import { createStage, hasWebGL, makeLabel, prefersReducedMotion, readTheme, type Stage } from "./stage";

const R = 1.6; // 지구 반지름(장면 단위)
const ISS_ALT = 0.34; // ISS 고도는 보이도록 과장한다
const UP = new THREE.Vector3(0, 1, 0);

type QuakePoint = { lat: number; lon: number; value: number; label: string; at?: string };
type Tip = { x: number; y: number; w: number; quake: QuakePoint };

const vec = (lat: number, lon: number, radius: number) => new THREE.Vector3(...latLonToVector(lat, lon, radius));

function disposeChildren(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const material of materials) {
        const map = (material as THREE.SpriteMaterial).map;
        map?.dispose();
        material.dispose();
      }
    });
  }
}

/** 지진(최근 24시간)·ISS 현재 위치·내 위치를 한 번에 보는 3D 지구본. */
export function Globe3D() {
  const { place, mode } = useLocation();
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const groupsRef = useRef<{ quakes: THREE.Group; iss: THREE.Group; pin: THREE.Group; pulses: THREE.Mesh[] } | null>(null);
  const quakeMeshRef = useRef<{ mesh: THREE.InstancedMesh; points: QuakePoint[] } | null>(null);
  const trailRef = useRef<THREE.Vector3[]>([]);
  const [supported] = useState(() => hasWebGL());
  const [tip, setTip] = useState<Tip | null>(null);
  const [rotating, setRotating] = useState(() => !prefersReducedMotion());
  const [themeKey, setThemeKey] = useState(0);
  const [ready, setReady] = useState(0); // 무대가 만들어질 때마다 데이터 그룹을 다시 채운다

  const quakesQuery = useQuery({
    queryKey: ["widget", "usgs-earthquake", "/api/widgets/usgs-earthquake"],
    queryFn: () => fetchWidgetPayload("/api/widgets/usgs-earthquake"),
    refetchInterval: 5 * 60_000,
    retry: false,
  });
  const issQuery = useQuery({
    queryKey: ["widget", "iss", "/api/widgets/iss"],
    queryFn: () => fetchWidgetPayload("/api/widgets/iss"),
    refetchInterval: 15_000,
    retry: false,
  });
  const quakes = useMemo<QuakePoint[]>(() => quakesQuery.data?.value?.points ?? [], [quakesQuery.data]);
  const issLat = issQuery.data?.value?.facts?.lat;
  const issLon = issQuery.data?.value?.facts?.lon;

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeKey((value) => value + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  // 1) 무대 + 고정 요소(지구, 위경도선, 대기)
  useEffect(() => {
    const host = hostRef.current;
    if (!supported || !host) return;
    const theme = readTheme();
    const reduced = prefersReducedMotion();
    const pulses: THREE.Mesh[] = [];

    const stage = createStage(host, {
      position: [0, 1.6, 6.6], target: [0, 0, 0], autoRotate: rotating, autoRotateSpeed: 0.5,
      minDistance: 2.8, maxDistance: 11, fov: 40,
      isAnimating: () => pulses.length > 0 && !reduced,
      onFrame: (now) => {
        if (reduced) return;
        pulses.forEach((ring, index) => {
          const phase = ((now / 1800) + index * 0.37) % 1;
          ring.scale.setScalar(1 + phase * 2.4);
          (ring.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * 0.7;
        });
      },
    });
    stageRef.current = stage;
    const { scene } = stage;

    scene.add(new THREE.AmbientLight(0xffffff, theme.dark ? 0.9 : 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, theme.dark ? 1.1 : 1.3);
    sun.position.set(4, 3, 5);
    scene.add(sun);

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(R, 72, 54),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.dark ? "#0f1a14" : "#c9dcf3"), roughness: 0.8, metalness: 0.04 }),
    );
    scene.add(globe);

    // 위경도선(30°)
    const grid: number[] = [];
    const seg = 96;
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let i = 0; i < seg; i += 1) {
        const a = vec(lat, (i / seg) * 360 - 180, R * 1.003);
        const b = vec(lat, ((i + 1) / seg) * 360 - 180, R * 1.003);
        grid.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    for (let lon = -180; lon < 180; lon += 30) {
      for (let i = 0; i < seg / 2; i += 1) {
        const a = vec(-90 + (i / (seg / 2)) * 180, lon, R * 1.003);
        const b = vec(-90 + ((i + 1) / (seg / 2)) * 180, lon, R * 1.003);
        grid.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const gridGeometry = new THREE.BufferGeometry();
    gridGeometry.setAttribute("position", new THREE.Float32BufferAttribute(grid, 3));
    scene.add(new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({ color: new THREE.Color(theme.dark ? theme.accent : theme.ink), transparent: true, opacity: theme.dark ? 0.16 : 0.14 })));

    // 대기 글로우
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.14, 64, 48),
      new THREE.ShaderMaterial({
        transparent: true, side: THREE.BackSide, depthWrite: false,
        uniforms: { glow: { value: new THREE.Color(theme.dark ? theme.accent : "#7db4ff") }, strength: { value: theme.dark ? 0.42 : 0.4 } },
        vertexShader: "varying vec3 vNormal; void main(){ vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "uniform vec3 glow; uniform float strength; varying vec3 vNormal; void main(){ float i = pow(max(0.0, 0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0))), 4.0); gl_FragColor = vec4(glow, clamp(i * strength, 0.0, 1.0)); }",
      }),
    ));

    const quakesGroup = new THREE.Group();
    const issGroup = new THREE.Group();
    const pinGroup = new THREE.Group();
    scene.add(quakesGroup, issGroup, pinGroup);
    groupsRef.current = { quakes: quakesGroup, iss: issGroup, pin: pinGroup, pulses };
    setReady((value) => value + 1);

    // 지진 막대 호버
    const canvas = stage.renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pending = false;
    function onMove(event: PointerEvent) {
      if (pending || event.buttons !== 0) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        const target = quakeMeshRef.current;
        if (!target) return;
        const rect = canvas.getBoundingClientRect();
        pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, stage.camera);
        raycaster.params.Line = { threshold: 0.05 };
        const hit = raycaster.intersectObject(target.mesh)[0];
        // 지구 뒷면에 가려진 막대는 선택하지 않는다.
        const globeHit = raycaster.intersectObject(globe)[0];
        if (hit?.instanceId !== undefined && (!globeHit || hit.distance <= globeHit.distance + 0.05)) {
          canvas.style.cursor = "pointer";
          setTip({ x: event.clientX - rect.left, y: event.clientY - rect.top, w: rect.width, quake: target.points[hit.instanceId] });
        } else {
          canvas.style.cursor = "grab";
          setTip(null);
        }
      });
    }
    const onLeave = () => setTip(null);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);

    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      stage.dispose();
      stageRef.current = null;
      groupsRef.current = null;
      quakeMeshRef.current = null;
      setTip(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, themeKey]);

  // 2) 지진 막대: 데이터가 바뀔 때만 다시 만든다.
  useEffect(() => {
    const groups = groupsRef.current;
    const stage = stageRef.current;
    if (!groups || !stage) return;
    disposeChildren(groups.quakes);
    groups.pulses.length = 0;
    quakeMeshRef.current = null;
    if (quakes.length === 0) { stage.invalidate(); return; }

    const geometry = new THREE.CylinderGeometry(0.014, 0.022, 1, 8);
    geometry.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1, emissiveIntensity: 0.6 }), quakes.length);
    const matrix = new THREE.Object3D();
    const strongRings: THREE.Mesh[] = [];
    quakes.forEach((quake, index) => {
      const normal = vec(quake.lat, quake.lon, 1);
      matrix.position.copy(normal).multiplyScalar(R);
      matrix.quaternion.setFromUnitVectors(UP, normal);
      matrix.scale.set(1 + (quake.value - 2.5) * 0.18, quakeHeight(quake.value), 1 + (quake.value - 2.5) * 0.18);
      matrix.updateMatrix();
      mesh.setMatrixAt(index, matrix.matrix);
      mesh.setColorAt(index, new THREE.Color(quakeColor(quake.value)));
      if (quake.value >= 5 && strongRings.length < 12) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.05, 0.062, 40),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(quakeColor(quake.value)), transparent: true, side: THREE.DoubleSide, depthWrite: false }),
        );
        ring.position.copy(normal).multiplyScalar(R * 1.004);
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        groups.quakes.add(ring);
        strongRings.push(ring);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    groups.quakes.add(mesh);
    groups.pulses.push(...strongRings);
    quakeMeshRef.current = { mesh, points: quakes };
    stage.invalidate();
  }, [quakes, ready]);

  // 3) ISS: 위치가 갱신될 때마다 마커·근사 궤도·이동 흔적만 바꾼다.
  useEffect(() => {
    const groups = groupsRef.current;
    const stage = stageRef.current;
    if (!groups || !stage || typeof issLat !== "number" || typeof issLon !== "number") return;
    const theme = readTheme();
    disposeChildren(groups.iss);

    const position = vec(issLat, issLon, R + ISS_ALT);
    const trail = trailRef.current;
    if (trail.length === 0 || trail[trail.length - 1].distanceTo(position) > 0.001) trail.push(position.clone());
    if (trail.length > 40) trail.shift();

    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.dark ? theme.accent : "#111111") }));
    marker.position.copy(position);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.accent), transparent: true, opacity: 0.35, depthWrite: false }));
    halo.position.copy(position);
    const tether = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([vec(issLat, issLon, R), position]),
      new THREE.LineBasicMaterial({ color: new THREE.Color(theme.ink), transparent: true, opacity: 0.45 }),
    );
    const label = makeLabel("ISS", theme.ink, 28, 0.2);
    label.position.copy(position).multiplyScalar(1.06).add(new THREE.Vector3(0, 0.12, 0));
    groups.iss.add(marker, halo, tether, label);

    const orbit = orbitPath(issLat, issLon, R + ISS_ALT);
    if (orbit) {
      groups.iss.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(orbit.map(([x, y, z]) => new THREE.Vector3(x, y, z))),
        new THREE.LineBasicMaterial({ color: new THREE.Color(theme.accent), transparent: true, opacity: theme.dark ? 0.55 : 0.8 }),
      ));
    }
    if (trail.length > 1) {
      groups.iss.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(trail),
        new THREE.LineBasicMaterial({ color: new THREE.Color(theme.ink), transparent: true, opacity: 0.8 }),
      ));
    }
    stage.invalidate();
  }, [issLat, issLon, ready, themeKey]);

  // 4) 내 위치 핀
  useEffect(() => {
    const groups = groupsRef.current;
    const stage = stageRef.current;
    if (!groups || !stage) return;
    const theme = readTheme();
    disposeChildren(groups.pin);
    const normal = vec(place.lat, place.lon, 1);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.accent) }));
    head.position.copy(normal).multiplyScalar(R + 0.16);
    const stem = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([normal.clone().multiplyScalar(R), normal.clone().multiplyScalar(R + 0.16)]),
      new THREE.LineBasicMaterial({ color: new THREE.Color(theme.ink) }),
    );
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.085, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.accent), side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    ring.position.copy(normal).multiplyScalar(R * 1.004);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const label = makeLabel(place.name, theme.ink, 26, 0.2);
    label.position.copy(normal).multiplyScalar(R + 0.2).add(new THREE.Vector3(0, 0.16, 0));
    groups.pin.add(head, stem, ring, label);
    stage.invalidate();
  }, [place, ready, themeKey]);

  function focus(lat: number | undefined, lon: number | undefined, distance = 5.2) {
    const stage = stageRef.current;
    if (!stage || typeof lat !== "number" || typeof lon !== "number") return;
    stage.flyTo(vec(lat, lon, distance), new THREE.Vector3(0, 0, 0));
  }

  function toggleRotate() {
    const stage = stageRef.current;
    const next = !rotating;
    setRotating(next);
    if (stage) { stage.controls.autoRotate = next; stage.invalidate(); }
  }

  if (!supported) {
    return <p className="viz-fallback" role="note">이 브라우저에서는 3D(WebGL)를 쓸 수 없어 지진·ISS 위젯의 숫자로 대신 확인해 주세요.</p>;
  }

  const strong = quakes.filter((quake) => quake.value >= 5).length;
  const summary = `3D 지구본: 최근 24시간 규모 2.5 이상 지진 ${quakes.length}건(규모 5 이상 ${strong}건), ISS 위치 ${typeof issLat === "number" ? `${issLat.toFixed(1)}°, ${issLon?.toFixed(1)}°` : "확인 중"}, 내 위치 ${place.name}.`;

  return (
    <div className="viz3d">
      <div className="viz3d__stage viz3d__stage--globe" ref={hostRef} role="img" aria-label={summary}>
        {tip && (
          <div className="viz3d__tip" style={{ left: Math.max(8, Math.min(tip.x + 14, tip.w - 240)), top: Math.max(8, tip.y - 12) }} role="status">
            <strong>규모 {tip.quake.value.toFixed(1)}</strong>
            <span>{tip.quake.label}</span>
            {tip.quake.at && <small>{new Date(tip.quake.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</small>}
          </div>
        )}
        <div className="viz3d__hint" aria-hidden="true">드래그로 회전 · 휠/핀치로 확대 · 막대에 올리면 지진 정보</div>
      </div>
      <div className="viz3d__bar">
        <ul className="viz-legend" aria-label="범례">
          <li><i style={{ background: quakeColor(2.6) }} />M2.5+</li>
          <li><i style={{ background: quakeColor(4.2) }} />M4+</li>
          <li><i style={{ background: quakeColor(5.2) }} />M5+</li>
          <li><i style={{ background: quakeColor(6.2) }} />M6+</li>
          <li><i className="viz-legend__ring" />ISS 근사 궤도</li>
        </ul>
        <div className="viz3d__buttons" role="group" aria-label="시점">
          <button type="button" onClick={() => focus(place.lat, place.lon)} disabled={mode === "idle"}>내 위치</button>
          <button type="button" onClick={() => focus(issLat, issLon, 5.4)} disabled={typeof issLat !== "number"}>ISS</button>
          <button type="button" onClick={() => stageRef.current?.flyTo(new THREE.Vector3(0, 1.6, 6.6), new THREE.Vector3(0, 0, 0))}>전체</button>
          <button type="button" aria-pressed={rotating} onClick={toggleRotate}>자동 회전</button>
        </div>
      </div>
      <p className="viz3d__note">지진이 많은 곳을 이으면 지구의 판 경계가 드러납니다. ISS 고도는 보이도록 과장했고, 궤도는 현재 위치와 경사각(51.6°)으로 그린 근사선입니다.</p>
      <p className="sr-only">{summary}</p>
    </div>
  );
}
