export type Vec3 = [number, number, number];

/** 위도·경도(도) → 구면 좌표. +Y가 북극, 경도 0이 +Z 방향. */
export function latLonToVector(lat: number, lon: number, radius = 1): Vec3 {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  return [radius * Math.cos(phi) * Math.sin(lambda), radius * Math.sin(phi), radius * Math.cos(phi) * Math.cos(lambda)];
}

/** 규모별 색: 색각 이상에서도 밝기 순서가 구분되도록 밝은 청록 → 노랑 → 주황 → 빨강. */
export function quakeColor(magnitude: number): string {
  if (magnitude >= 6) return "#ff4d3d";
  if (magnitude >= 5) return "#ff8a1f";
  if (magnitude >= 4) return "#ffd23f";
  return "#3fd0c0";
}

/** 규모 → 막대 높이(지구 반지름 1.6 기준 비율). 2.5는 작게, 7은 눈에 띄게. */
export function quakeHeight(magnitude: number): number {
  return 0.06 + Math.max(0, magnitude - 2.5) * 0.085;
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/**
 * ISS 현재 위치를 지나는 근사 궤도(경사각 51.64°의 대원)를 점 목록으로 만든다.
 * 진행 방향(상승/하강)은 알 수 없어 한 가지로 가정하므로 "근사"일 뿐이다.
 * 위도가 경사각을 넘으면(해당 없음) null.
 */
export function orbitPath(lat: number, lon: number, radius: number, inclinationDeg = 51.64, segments = 128): Vec3[] | null {
  const p0 = latLonToVector(lat, lon, 1);
  const inc = (inclinationDeg * Math.PI) / 180;
  const horizontal = Math.hypot(p0[0], p0[2]);
  const rhs = (-Math.cos(inc) / Math.sin(inc)) * p0[1];
  if (horizontal === 0 || Math.abs(rhs) > horizontal) return null;
  const phi = Math.atan2(p0[2], p0[0]) + Math.acos(rhs / horizontal);
  const normal: Vec3 = add(scale([0, 1, 0], Math.cos(inc)), scale([Math.cos(phi), 0, Math.sin(phi)], Math.sin(inc)));
  const tangent = cross(normal, p0);
  const points: Vec3[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(scale(add(scale(p0, Math.cos(angle)), scale(tangent, Math.sin(angle))), radius));
  }
  return points;
}

/** 궤도 평면 법선과 점들의 직교성 검사용(테스트). */
export function planeResidual(points: Vec3[], normal: Vec3): number {
  return Math.max(...points.map((point) => Math.abs(dot(point, normal))));
}
