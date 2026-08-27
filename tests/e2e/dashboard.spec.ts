import { expect, test } from "@playwright/test";

const RUN_ID = process.env.SCREENSHOT_RUN_ID
  ?? new Date().toISOString().replace(/[:.]/g, "-");
const SCREENSHOT_DIR = `docs/검증스크린샷/${RUN_ID}`;
const EXPECT_LIVE_PROVIDERS = process.env.EXPECT_LIVE_PROVIDERS === "true";

const dailyHistoryFixture = {
  metric: "KRW-BTC 일봉 종가",
  timezone: "Asia/Seoul",
  source: {
    provider: "Upbit Open API",
    url: "https://api.upbit.com/v1/candles/days?market=KRW-BTC&count=3",
    endpointTemplate: "GET /v1/candles/days?market=KRW-BTC&count=3",
  },
  fetchedAt: "2026-08-27T01:30:00.000Z",
  records: [
    {
      id: "upbit:KRW-BTC:2026-08-27",
      metric: "KRW-BTC 일봉 종가",
      date: "2026-08-27",
      timezone: "Asia/Seoul",
      value: 160_000_000,
      unit: "KRW",
      sourceTimestamp: "2026-08-27T09:00:00+09:00",
      fetchedAt: "2026-08-27T01:30:00.000Z",
      storedAt: "2026-08-27T01:30:00.000Z",
    },
    {
      id: "upbit:KRW-BTC:2026-08-26",
      metric: "KRW-BTC 일봉 종가",
      date: "2026-08-26",
      timezone: "Asia/Seoul",
      value: 158_000_000,
      unit: "KRW",
      sourceTimestamp: "2026-08-26T09:00:00+09:00",
      fetchedAt: "2026-08-27T01:30:00.000Z",
      storedAt: "2026-08-27T01:30:00.000Z",
    },
  ],
};

async function mockDailyHistory(page: import("@playwright/test").Page) {
  await page.route("**/api/widgets/upbit-daily-history", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dailyHistoryFixture) });
  });
}

test("상태별 fixture 카드 5개와 투명성 필드를 표시한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/verification");

  await expect(page.getByRole("heading", { name: "T04 상태별 카드 검증" })).toBeVisible();
  await expect(page.getByRole("list").locator("li")).toHaveCount(5);
  await expect(page.getByRole("list").locator("li").nth(0)).toContainText("값의 맥락");
  await expect(page.getByRole("list").locator("li").nth(4)).toContainText("어제와 비교 검증");
  const fixtures = page.getByLabel("상태별 검증 위젯");
  await expect(fixtures.locator(".widget-card")).toHaveCount(5);
  await expect(fixtures.getByLabel("상태: 정상")).toBeVisible();
  await expect(fixtures.getByLabel("상태: 오래된 데이터")).toBeVisible();
  await expect(fixtures.getByLabel("상태: 점검 중")).toBeVisible();
  await expect(fixtures.getByLabel("상태: 호출 제한")).toBeVisible();
  await expect(fixtures.getByLabel("상태: 조회 실패")).toBeVisible();
  await expect(fixtures.getByText("API 미제공").first()).toBeVisible();

  await page.screenshot({ path: `${SCREENSHOT_DIR}/01_상태별_카드_검증.png`, fullPage: true });
});

test("장애 5종을 서로 다른 문구로 표시하고 오래된 값·빈 상태·복구를 검증한다", async ({ page }) => {
  const verificationRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/verification/failure")) verificationRequests.push(request.url());
  });
  const cases = [
    ["응답 시간 초과", "timeout"],
    ["인증 실패", "unauthorized"],
    ["호출 제한", "rate-limited"],
    ["오프라인", "offline"],
    ["응답 형식 변경", "schema-changed"],
  ] as const;

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/verification");
  const lab = page.locator(".failure-lab");

  for (const [label, filename] of cases) {
    await lab.getByRole("button", { name: label }).click();
    await expect(lab.getByText(`장애 유형: ${label}`)).toBeVisible();
    await expect(lab.getByLabel("상태: 오래된 데이터")).toBeVisible();
    await expect(lab.getByText("최신 조회에 실패해 마지막 정상값을 표시합니다.", { exact: false })).toBeVisible();
    await lab.screenshot({ path: `${SCREENSHOT_DIR}/장애_${filename}.png` });
  }

  await lab.getByRole("checkbox", { name: "마지막 정상값 있음" }).uncheck();
  await lab.getByRole("button", { name: "응답 형식 변경" }).click();
  await expect(lab.getByText("표시할 데이터 없음")).toBeVisible();
  await expect(lab.getByText("정상 조회 기록이 없어 빈 상태로 표시합니다.", { exact: false })).toBeVisible();
  await lab.screenshot({ path: `${SCREENSHOT_DIR}/장애_정상값없음_빈상태.png` });

  await lab.getByRole("checkbox", { name: "마지막 정상값 있음" }).check();
  await lab.locator(".refresh-block button").click();
  await expect(lab.getByLabel("상태: 정상")).toBeVisible();
  await lab.screenshot({ path: `${SCREENSHOT_DIR}/장애_다시시도_복구.png` });
  for (const kind of ["timeout", "unauthorized", "rate_limited", "offline", "schema_changed", "recovery"]) {
    expect(verificationRequests.some((url) => url.includes(`kind=${kind}`))).toBeTruthy();
  }
});

test("실시간 대시보드가 자체 API만 호출하고 5개 위젯을 유지한다", async ({ page }) => {
  const externalBrowserRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("api.upbit.com") || url.includes("githubstatus.com/api") || url.includes("developer-lostark.game.onstove.com")) {
      externalBrowserRequests.push(url);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await mockDailyHistory(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await expect(page.locator(".widget-card")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "전체 새로고침" })).toBeVisible();
  await expect(page.getByLabel("통화 선택")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "아이템 검색" })).toBeVisible();
  await page.waitForTimeout(2_500);
  expect(externalBrowserRequests).toEqual([]);
  const unexpectedConsoleErrors = EXPECT_LIVE_PROVIDERS
    ? consoleErrors
    : consoleErrors.filter((message) => !message.includes("server responded with a status of 503"));
  expect(unexpectedConsoleErrors).toEqual([]);

  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toMatch(/Authorization:\s*bearer/i);
  expect(bodyText).not.toMatch(/authkey=[A-Za-z0-9_-]{8,}/i);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02_실시간_대시보드.png`, fullPage: true });
});

test("서로 다른 실제 날짜 2건을 날짜별 한 건으로 저장하고 차이·방향·단위를 표시한다", async ({ page }) => {
  const response = await page.request.get("/api/widgets/upbit-daily-history");
  expect(response.ok()).toBeTruthy();
  const actual = await response.json() as typeof dailyHistoryFixture;
  expect(actual.timezone).toBe("Asia/Seoul");
  expect(actual.records).toHaveLength(2);
  expect(new Set(actual.records.map((record) => record.date)).size).toBe(2);

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  const panel = page.locator(".daily-history");
  await expect(panel.getByText("기준 시간대: Asia/Seoul")).toBeVisible();
  await expect(panel.locator("tbody tr")).toHaveCount(2);
  await expect(panel.getByText("이전 대비 변화")).toBeVisible();
  await expect(panel.getByText("단위: KRW")).toBeVisible();

  await panel.getByRole("button", { name: "일별 기록 동기화" }).click();
  await expect(panel.locator("tbody tr")).toHaveCount(2);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pulseboard-daily-records-v1") ?? "[]"));
  expect(stored).toHaveLength(2);
  expect(new Set(stored.map((record: { id: string }) => record.id)).size).toBe(2);
  await panel.screenshot({ path: `${SCREENSHOT_DIR}/05_날짜별기록_중복방지_어제비교.png` });
});

test("원자료와 localStorage 저장값이 다르면 비교를 중단한다", async ({ page }) => {
  await mockDailyHistory(page);
  await page.addInitScript((record) => {
    localStorage.setItem("pulseboard-daily-records-v1", JSON.stringify([record]));
  }, { ...dailyHistoryFixture.records[0], value: 1, storedAt: "2026-08-27T01:31:00.000Z" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const panel = page.locator(".daily-history");
  await expect(panel.getByRole("alert")).toContainText("원자료와 저장값이 달라 비교 계산을 중단했습니다.");
  await expect(panel.getByText("원자료와 저장값이 일치해야 비교값을 표시합니다.")).toBeVisible();
  const firstRow = panel.locator("tbody tr").first();
  await expect(firstRow).toContainText("₩160,000,000");
  await expect(firstRow).toContainText("₩1");
  await panel.screenshot({ path: `${SCREENSHOT_DIR}/07_원자료_저장값_불일치_비교중단.png` });
});

test("출처 주소를 한 번 눌러 Upbit 원자료를 연다", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const panel = page.locator(".daily-history");
  await expect(panel.getByRole("link", { name: "Upbit Open API 원자료" })).toBeVisible();

  const [sourcePage] = await Promise.all([
    context.waitForEvent("page"),
    panel.getByRole("link", { name: "Upbit Open API 원자료" }).click(),
  ]);
  await sourcePage.waitForLoadState("domcontentloaded");
  expect(sourcePage.url()).toContain("api.upbit.com/v1/candles/days");
  await sourcePage.screenshot({ path: `${SCREENSHOT_DIR}/06_출처링크_한번클릭_원자료.png`, fullPage: true });
});

test("공개 API 계약과 키 비노출 응답을 검증한다", async ({ request }) => {
  const publicEndpoints = ["/api/widgets/upbit-ticker", "/api/widgets/status"];
  const protectedEndpoints = [
    "/api/widgets/lostark-notices",
    "/api/widgets/lostark-market?itemName=%ED%8C%8C%EA%B4%B4%EA%B0%95%EC%84%9D",
    "/api/widgets/exchange-rate?currency=USD",
  ];

  for (const endpoint of [...publicEndpoints, ...(EXPECT_LIVE_PROVIDERS ? protectedEndpoints : [])]) {
    const response = await request.get(endpoint);
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.status).toBe("ok");
    expect(payload.value).toBeTruthy();
    expect(payload.source.provider).toBeTruthy();
    expect(payload.fetchedAt).toBeTruthy();
  }

  for (const endpoint of protectedEndpoints) {
    const response = await request.get(endpoint);
    const body = await response.text();
    expect(body).not.toMatch(/Authorization\s*:\s*bearer/i);
    expect(body).not.toMatch(/authkey=[A-Za-z0-9_-]{8,}/i);
    expect(body).not.toMatch(/serviceKey=[A-Za-z0-9_%_-]{8,}/i);
  }
});

test("모바일 그리드와 수동 새로고침 쿨다운을 제공한다", async ({ page }) => {
  await mockDailyHistory(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const firstRefresh = page.getByRole("button", { name: "로스트아크 공지 새로고침" });
  await expect(firstRefresh).toBeVisible();
  await firstRefresh.click();
  await expect(page.getByText(/수동 갱신 \d+초 후/).first()).toBeVisible();
  await expect(firstRefresh).toBeDisabled();

  await page.screenshot({ path: `${SCREENSHOT_DIR}/03_모바일_새로고침_검증.png`, fullPage: true });
});

test("다크 모드에서도 정보 구조를 유지한다", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/verification");
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByLabel("상태별 검증 위젯").locator(".widget-card")).toHaveCount(5);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04_다크모드_검증.png`, fullPage: true });
});
