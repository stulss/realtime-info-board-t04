import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "./http";

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
});
