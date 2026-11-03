import { fetchJson } from "@/lib/server/http";
import { shortSido } from "@/lib/location";

type Reverse = {
  countryCode?: string;
  countryName?: string;
  principalSubdivision?: string;
  city?: string;
  locality?: string;
};

export type ResolvedPlace = { name: string; sido?: string; countryCode?: string };

const TTL_MS = 24 * 60 * 60_000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { value: ResolvedPlace; expiresAt: number }>();

/** 좌표 → 지명. 실패해도 날씨 조회는 계속되도록 "내 위치"로 대체한다. */
export async function resolvePlace(lat: number, lon: number): Promise<ResolvedPlace> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  let value: ResolvedPlace = { name: "내 위치" };
  try {
    const body = await fetchJson<Reverse>(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ko`,
      { retries: 1, timeoutMs: 6_000 },
    );
    value = describePlace(body);
  } catch {
    return value; // 실패는 캐시하지 않아 다음 요청에서 다시 시도한다.
  }

  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

export function describePlace(body: Reverse): ResolvedPlace {
  if (body?.countryCode === "KR") {
    const sido = shortSido(body.principalSubdivision) ?? shortSido(body.city);
    const base = sido ?? body.city ?? body.principalSubdivision ?? "내 위치";
    const locality = body.locality && body.locality !== body.city && body.locality !== body.principalSubdivision
      ? body.locality
      : undefined;
    return { name: (locality ? `${base} ${locality}` : base).slice(0, 30), sido, countryCode: "KR" };
  }
  const name = body?.city || body?.principalSubdivision || body?.countryName || "내 위치";
  return { name: name.slice(0, 30), countryCode: body?.countryCode };
}
