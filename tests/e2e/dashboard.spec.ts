import { expect, test } from "@playwright/test";

const RUN_ID = process.env.SCREENSHOT_RUN_ID
  ?? new Date().toISOString().replace(/[:.]/g, "-");
const SCREENSHOT_DIR = `docs/검증스크린샷/${RUN_ID}`;
const EXPECT_LIVE_PROVIDERS = process.env.EXPECT_LIVE_PROVIDERS === "true";

test("상태별 fixture 카드 5개와 투명성 필드를 표시한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/verification");

  await expect(page.getByRole("heading", { name: "상태별 카드 검증" })).toBeVisible();
  await expect(page.locator(".widget-card")).toHaveCount(5);
  await expect(page.getByLabel("상태: 정상")).toBeVisible();
  await expect(page.getByLabel("상태: 오래된 데이터")).toBeVisible();
  await expect(page.getByLabel("상태: 점검 중")).toBeVisible();
  await expect(page.getByLabel("상태: 호출 제한")).toBeVisible();
  await expect(page.getByLabel("상태: 조회 실패")).toBeVisible();
  await expect(page.getByText("API 미제공").first()).toBeVisible();

  await page.screenshot({ path: `${SCREENSHOT_DIR}/01_상태별_카드_검증.png`, fullPage: true });
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
  await expect(page.locator(".widget-card")).toHaveCount(5);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04_다크모드_검증.png`, fullPage: true });
});
