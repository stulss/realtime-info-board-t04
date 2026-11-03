import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type StageTheme = {
  dark: boolean;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  paper: string;
  surface: string;
};

export function hasWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** CSS 변수에서 현재 테마 색을 읽는다. */
export function readTheme(): StageTheme {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    dark: document.documentElement.dataset.theme === "dark",
    ink: read("--ink", "#171713"),
    muted: read("--muted", "#6d6c64"),
    line: read("--line", "#dedbd1"),
    accent: read("--accent", "#d8ff3e"),
    paper: read("--paper", "#f4f2ed"),
    surface: read("--surface", "#ffffff"),
  };
}

export type Stage = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  renderer: THREE.WebGLRenderer;
  /** 카메라를 부드럽게 옮긴다(모션 줄이기면 즉시 이동). */
  flyTo: (position: THREE.Vector3, target?: THREE.Vector3) => void;
  /** 다음 프레임에 한 번 그리도록 요청(자동 회전이 꺼진 상태의 갱신용). */
  invalidate: () => void;
  dispose: () => void;
};

type StageOptions = {
  fov?: number;
  position: [number, number, number];
  target?: [number, number, number];
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  minDistance?: number;
  maxDistance?: number;
  maxPolarAngle?: number;
  onFrame?: (time: number, delta: number) => void;
  /** true를 돌려주면 이번 프레임은 계속 그린다(진행 중 애니메이션). */
  isAnimating?: () => boolean;
};

/**
 * three.js 무대를 만든다.
 * - 화면 밖·숨겨진 탭에서는 렌더링을 멈춰 배터리를 아낀다.
 * - 정적인 장면은 필요할 때만 그린다(autoRotate·애니메이션·입력이 있을 때).
 * - dispose()가 지오메트리·재질·텍스처·렌더러를 모두 해제한다.
 */
export function createStage(container: HTMLElement, options: StageOptions): Stage {
  const reduced = prefersReducedMotion();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.touchAction = "none";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(options.fov ?? 45, 1, 0.1, 200);
  camera.position.set(...options.position);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = options.minDistance ?? 2;
  controls.maxDistance = options.maxDistance ?? 30;
  if (options.maxPolarAngle !== undefined) controls.maxPolarAngle = options.maxPolarAngle;
  if (options.target) controls.target.set(...options.target);
  controls.autoRotate = Boolean(options.autoRotate) && !reduced;
  controls.autoRotateSpeed = options.autoRotateSpeed ?? 0.6;
  controls.listenToKeyEvents(renderer.domElement); // 키보드(화살표)로도 회전·이동
  renderer.domElement.tabIndex = 0;

  let frame = 0;
  let visible = true;
  let needsRender = true;
  let last = performance.now();
  let fly: { from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; start: number } | undefined;

  const stopAutoRotateOnInput = () => { controls.autoRotate = false; };
  controls.addEventListener("start", stopAutoRotateOnInput);
  controls.addEventListener("change", () => { needsRender = true; });

  function resize() {
    const { clientWidth: width, clientHeight: height } = container;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    needsRender = true;
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) needsRender = true; }, { threshold: 0.01 });
  intersection.observe(container);
  resize();

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    if (!visible || document.hidden) { last = now; return; }
    const delta = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (fly) {
      const progress = Math.min(1, (now - fly.start) / 900);
      const eased = 1 - Math.pow(1 - progress, 3);
      camera.position.lerpVectors(fly.from, fly.to, eased);
      controls.target.lerpVectors(fly.fromT, fly.toT, eased);
      if (progress >= 1) fly = undefined;
      needsRender = true;
    }
    const moved = controls.update(delta);
    options.onFrame?.(now, delta);
    const animating = Boolean(options.isAnimating?.()) || controls.autoRotate || fly !== undefined;
    if (needsRender || animating || moved) {
      renderer.render(scene, camera);
      needsRender = false;
    }
  }
  frame = requestAnimationFrame(tick);

  return {
    scene, camera, controls, renderer,
    invalidate: () => { needsRender = true; },
    flyTo(position, target) {
      const toT = target ?? controls.target.clone();
      if (reduced) {
        camera.position.copy(position);
        controls.target.copy(toT);
        needsRender = true;
        return;
      }
      controls.autoRotate = false;
      fly = { from: camera.position.clone(), to: position.clone(), fromT: controls.target.clone(), toT: toT.clone(), start: performance.now() };
    },
    dispose() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersection.disconnect();
      controls.removeEventListener("start", stopAutoRotateOnInput);
      controls.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const material of materials) {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) value.dispose();
          }
          material.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

/** 글자를 캔버스 텍스처 스프라이트로 만든다(축 라벨용). */
export function makeLabel(text: string, color: string, fontPx = 28, worldHeight = 0.34): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `700 ${fontPx}px system-ui, -apple-system, "Segoe UI", "Noto Sans KR", sans-serif`;
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width) + 16;
  canvas.width = width;
  canvas.height = fontPx + 16;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 8, canvas.height / 2 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set((worldHeight * canvas.width) / canvas.height, worldHeight, 1);
  return sprite;
}
