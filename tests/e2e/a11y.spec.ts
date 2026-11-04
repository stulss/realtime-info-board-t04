import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** 접근성 자동 점검(axe-core, WCAG 2.1 A/AA). 위반이 있으면 규칙·대상·요약을 함께 출력한다. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function audit(page: import("@playwright/test").Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((violation) => `${violation.id} (${violation.impact}) ×${violation.nodes.length}: ${violation.nodes.slice(0, 3).map((node) => node.target.join(" ")).join(" | ")}`);
  expect(summary, `${label} 접근성 위반`).toEqual([]);
}

test.describe("접근성(axe)", () => {
  test("정보판 라이트/다크", async ({ page }) => {
    await page.route("**/api/history**", (route) => route.fulfill({ status: 503, json: {} }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForTimeout(3_500);
    await audit(page, "정보판(라이트)");
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await page.waitForTimeout(500);
    await audit(page, "정보판(다크)");
  });

  test("데이터 출처·검증 페이지", async ({ page }) => {
    await page.goto("/about");
    await page.waitForTimeout(1_200); // 등장 애니메이션이 끝난 뒤(투명도가 대비 계산에 섞이지 않게)
    await audit(page, "about");
    await page.goto("/verification");
    await page.waitForTimeout(1_500);
    await audit(page, "verification");
  });
});
