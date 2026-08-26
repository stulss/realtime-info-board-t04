import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const marketItem = {
  Name: "파괴강석",
  CurrentMinPrice: 12,
  RecentPrice: 13,
  YDayAvgPrice: 10,
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("LOSTARK_API_KEY", "test-jwt");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Lost Ark 거래장 adapter", () => {
  it("유효한 강화 재료 카테고리와 검색어로 거래장을 조회한다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ Categories: [{ Code: 50000, CodeName: "강화 재료" }] }))
      .mockResolvedValueOnce(Response.json({ Items: [marketItem], TotalCount: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const { fetchLostArkMarket } = await import("./lostark");

    const result = await fetchLostArkMarket("파괴강석");
    const request = fetchMock.mock.calls[1];
    const body = JSON.parse(String(request?.[1]?.body)) as Record<string, unknown>;

    expect(body.CategoryCode).toBe(50000);
    expect(body.ItemName).toBe("파괴강석");
    expect(body.ItemTier).toBeNull();
    expect(result.value?.headline).toBe("12 골드");
    expect(result.value?.subline).toBe("파괴강석");
  });

  it("첫 카테고리에 없으면 공식 옵션의 다음 카테고리를 검색한다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ Categories: [{ Code: 40000, CodeName: "각인서" }] }))
      .mockResolvedValueOnce(Response.json({ Items: [], TotalCount: 0 }))
      .mockResolvedValueOnce(Response.json({ Items: [marketItem], TotalCount: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const { fetchLostArkMarket } = await import("./lostark");

    await expect(fetchLostArkMarket("파괴강석")).resolves.toMatchObject({ status: "ok" });
    const secondSearchBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)) as Record<string, unknown>;
    expect(secondSearchBody.CategoryCode).toBe(40000);
  });
});
