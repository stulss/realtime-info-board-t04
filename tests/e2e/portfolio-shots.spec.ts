import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * README·포트폴리오용 대표 스크린샷을 docs/portfolio/ 에 만든다.
 * 평소 테스트에서는 건너뛰고, 다음처럼 켠다:  PORTFOLIO_SHOTS=1 npx playwright test portfolio-shots
 * (날씨 히어로 장면은 모킹, 나머지는 실제 데이터)
 */
const OUT = "docs/portfolio";
test.skip(!process.env.PORTFOLIO_SHOTS, "PORTFOLIO_SHOTS=1 일 때만 실행");

const scenes: Array<[string, number, number, string]> = [
  ["hero-day", 0, 1, "맑은 낮"],
  ["hero-night", 0, 0, "맑은 밤"],
  ["hero-rain", 63, 1, "비"],
  ["hero-snow", 73, 1, "눈"],
];

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

for (const [name, code, isDay] of scenes) {
  test(`히어로 장면: ${name}`, async ({ page }) => {
    await page.route("**/api/widgets/weather?**", (route) => route.continue());
    await page.route("**/api/widgets/weather", (route) => route.fulfill({ json: {
      value: {
        headline: "14°C", subline: "서울", metric: { key: "weather-temp@37.6,127.0", label: "서울 기온", value: 14.2, unit: "°C" },
        facts: { temperature: 14.2, apparent: 12.6, humidity: 61, wind: 8.4, weatherCode: code, isDay },
      },
      status: "ok", source: { provider: "Open-Meteo", docsUrl: "https://open-meteo.com", endpointTemplate: "GET /v1/forecast" },
      fetchedAt: new Date().toISOString(), cacheAgeMs: 0,
    } }));
    await page.setViewportSize({ width: 1200, height: 760 });
    await page.goto("/");
    await page.waitForTimeout(1_800);
    await page.locator(".sky").screenshot({ path: `${OUT}/${name}.png` });
  });
}

test("정보판 전체(라이트·다크)와 모바일", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForTimeout(8_000); // 실제 데이터와 8월 1일부터의 과거 기록이 채워질 때까지
  await page.screenshot({ path: `${OUT}/dashboard-light.png`, fullPage: true });
  await page.locator("#daily-log").scrollIntoViewIfNeeded();
  await page.locator(".smalls").screenshot({ path: `${OUT}/log-overview.png` });
  await page.getByRole("tab", { name: "달력" }).click();
  await page.locator(".log-views").screenshot({ path: `${OUT}/log-calendar.png` });
  await page.getByRole("tab", { name: "추세" }).click();
  await page.locator(".log-views").screenshot({ path: `${OUT}/log-trend.png` });
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; window.scrollTo(0, 0); });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/dashboard-dark.png` });
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/mobile.png` });
});
