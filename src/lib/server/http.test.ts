import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderHttpError, fetchJson } from "./http";

afterEach(() => vi.unstubAllGlobals());

describe("fetchJson", () => {
  it("429는 즉시 재시도하지 않고 retry-after를 보존한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("{}", { status: 429, headers: { "retry-after": "3" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchJson("https://provider.test", { retries: 3 })).rejects.toMatchObject({
      status: 429,
      retryAfterMs: 3_000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("일시적인 500 오류는 지수 백오프 후 재시도한다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchJson<{ ok: boolean }>("https://provider.test", { retries: 1 })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("503은 점검 상태 분기를 위해 즉시 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchJson("https://provider.test", { retries: 2 })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, "unauthorized"],
    [429, "rate_limited"],
  ] as const)("HTTP %s를 고유 장애 종류 %s로 분류한다", async (status, kind) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
    await expect(fetchJson("https://provider.test")).rejects.toMatchObject({ status, kind });
  });

  it("JSON 형식 변경을 별도 장애로 분류한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));
    await expect(fetchJson("https://provider.test")).rejects.toMatchObject({ kind: "schema_changed" });
  });

  it("공급자 오류 객체가 명시적인 장애 종류를 보존한다", () => {
    expect(new ProviderHttpError("offline", undefined, undefined, "offline").kind).toBe("offline");
  });

  it.each([
    [401, "unauthorized"],
    [429, "rate_limited"],
  ] as const)("직접 생성한 HTTP %s 오류도 %s로 분류한다", (status, kind) => {
    expect(new ProviderHttpError("manual", status).kind).toBe(kind);
  });
});
