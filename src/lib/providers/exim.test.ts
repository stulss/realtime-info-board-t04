import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchExchangeRate } from "./exim";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("한국수출입은행 환율 adapter", () => {
  it("신규 oapi 도메인을 호출하고 선택 통화를 공통 계약으로 정규화한다", async () => {
    vi.stubEnv("EXIM_SERVICE_KEY", "test-service-key");
    const fetchMock = vi.fn().mockResolvedValue(Response.json([
      { result: 1, cur_unit: " JPY(100) ", cur_nm: "일본 엔", deal_bas_r: "920.50" },
    ]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchExchangeRate("JPY(100)");
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));

    expect(requestedUrl.origin).toBe("https://oapi.koreaexim.go.kr");
    expect(requestedUrl.searchParams.get("authkey")).toBe("test-service-key");
    expect(requestedUrl.searchParams.get("data")).toBe("AP01");
    expect(result.value?.headline).toBe("920.50원");
    expect(result.value?.subline).toBe("JPY(100) 매매기준율");
    expect(result.source.endpointTemplate).not.toContain("test-service-key");
  });

  it.each([
    [2, 400, "요청 유형"],
    [3, 401, "인증키"],
    [4, 429, "일일 호출 한도"],
  ])("RESULT %i 오류를 즉시 분류한다", async (resultCode, status, message) => {
    vi.stubEnv("EXIM_SERVICE_KEY", "test-service-key");
    const fetchMock = vi.fn().mockResolvedValue(Response.json([{ result: resultCode }]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchExchangeRate()).rejects.toMatchObject({
      status,
      message: expect.stringContaining(message),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("비영업일의 빈 응답이면 이전 고시일을 탐색한다", async () => {
    vi.stubEnv("EXIM_SERVICE_KEY", "test-service-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([
        { result: 1, cur_unit: "USD", cur_nm: "미국 달러", deal_bas_r: "1,341.20" },
      ]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchExchangeRate();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.value?.headline).toBe("1,341.20원");
  });
});
