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
    url: "https://api.upbit.com/v1/candles/days?market=KRW-BTC&count=91",
    endpointTemplate: "GET /v1/candles/days?market=KRW-BTC&count=91",
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

async function blockHistory(page: import("@playwright/test").Page) {
  await page.route("**/api/history**", (route) => route.fulfill({ status: 503, json: { error: "disabled" } }));
}

async function mockDailyHistory(page: import("@playwright/test").Page) {
  await blockHistory(page);
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

test("실시간 대시보드가 자체 API만 호출하고 8개 위젯을 표시한다", async ({ page }) => {
  const externalBrowserRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (["api.upbit.com", "githubstatus.com/api", "earthquake.usgs.gov", "open-meteo.com", "frankfurter.dev", "coingecko.com", "open-notify.org", "sensor.community", "apis.data.go.kr"].some((host) => url.includes(host))) {
      externalBrowserRequests.push(url);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await mockDailyHistory(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await expect(page.locator(".tile")).toHaveCount(8);
  // 한국 일상에서 쓰지 않는 위젯(해외 지진·ISS·우주날씨·ETH·GitHub 상태 등)은 없다
  for (const removed of ["ISS", "이더리움", "GitHub", "우주날씨", "전 세계 지진", "시민 센서"]) {
    await expect(page.locator(".tile", { hasText: removed })).toHaveCount(0);
  }
  await expect(page.getByRole("button", { name: "전체 새로고침" })).toBeVisible();
  // 상세(조작 UI)는 점진적 공개: 처음엔 접혀 있고 펼치면 통화 선택이 나타난다.
  await expect(page.getByLabel("통화 선택")).toHaveCount(0);
  await page.locator(".tile", { hasText: "원·달러 고시환율" }).getByRole("button", { name: /상세/ }).click();
  await expect(page.getByLabel("통화 선택")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "아이템 검색" })).toHaveCount(0);
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

test("Upbit 확정 일봉 종가가 날짜별 한 줄로 자동 기록되고 어제 대비·단위를 표시한다", async ({ page }) => {
  const response = await page.request.get("/api/widgets/upbit-daily-history");
  expect(response.ok()).toBeTruthy();
  const actual = await response.json() as typeof dailyHistoryFixture;
  expect(actual.timezone).toBe("Asia/Seoul");
  // 2건으로 제한하지 않고 시작일(8월 1일)부터 어제까지 완료 일봉을 모두 돌려준다
  expect(actual.records.length).toBeGreaterThan(2);
  expect(new Set(actual.records.map((record) => record.date)).size).toBe(actual.records.length);
  expect(actual.records.map((record) => record.date).sort()[0]).toBe("2026-08-01");

  await mockDailyHistory(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  const log = page.locator(".daily-log");
  await expect(log.getByText("기준 시간대 Asia/Seoul")).toBeVisible();
  await expect(log.getByText("하루 한 줄씩 자동 저장")).toBeVisible();
  await expect(page.locator(".daily-history")).toHaveCount(0); // 별도 "하루 한 번 기록" 섹션은 없다

  await log.getByRole("tab", { name: /08-27/ }).click();
  const row = log.locator(".range-list li", { hasText: "Upbit BTC/KRW 일봉 종가" });
  await expect(row).toContainText("과거 원자료로 자동 채움");
  await expect(row).toContainText("160,000,000 KRW");
  await expect(row).toContainText("08-26 대비 +1.3%"); // 158,000,000 → 160,000,000
  await expect(row.locator(".range-list__delta")).toHaveAttribute("data-dir", "up");

  await page.reload(); // 새로고침해도 같은 날짜는 한 건
  await expect(log.getByRole("tab", { name: /08-26/ })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pulseboard-daily-log-v1") ?? "[]"));
  const closes = stored.filter((entry: { metricKey: string }) => entry.metricKey === "upbit-btc-krw-close");
  expect(closes).toHaveLength(2);
  expect(new Set(closes.map((entry: { id: string }) => entry.id)).size).toBe(2);
  await log.screenshot({ path: `${SCREENSHOT_DIR}/05_하루한줄_자동기록_어제비교.png` });
});

test("저장값이 원자료와 달라도 확정 일봉은 원자료 값으로 자동 보정된다", async ({ page }) => {
  await mockDailyHistory(page);
  await page.addInitScript(() => {
    localStorage.setItem("pulseboard-daily-log-v1", JSON.stringify([{
      id: "upbit-btc-krw-close:2026-08-27", metricKey: "upbit-btc-krw-close", label: "Upbit BTC/KRW 일봉 종가", unit: "KRW",
      date: "2026-08-27", first: 1, latest: 1, min: 1, max: 1, samples: 1,
      firstAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T01:31:00.000Z", lastFetchedAt: "2026-08-27T01:31:00.000Z", closed: true,
    }]));
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const log = page.locator(".daily-log");
  await log.getByRole("tab", { name: /08-27/ }).click();
  await expect(log.locator(".range-list li", { hasText: "일봉 종가" })).toContainText("160,000,000 KRW");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pulseboard-daily-log-v1") ?? "[]"));
  expect(stored.find((entry: { id: string }) => entry.id === "upbit-btc-krw-close:2026-08-27").latest).toBe(160_000_000);
  await log.screenshot({ path: `${SCREENSHOT_DIR}/07_저장값_원자료로_자동보정.png` });
});

test("출처 주소를 한 번 눌러 Upbit 원자료를 연다", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const link = page.locator(".daily-log").getByRole("link", { name: /Upbit 일봉 원자료/ });
  await expect(link).toBeVisible();

  const [sourcePage] = await Promise.all([
    context.waitForEvent("page"),
    link.click(),
  ]);
  await sourcePage.waitForLoadState("domcontentloaded");
  expect(sourcePage.url()).toContain("api.upbit.com/v1/candles/days");
  await sourcePage.screenshot({ path: `${SCREENSHOT_DIR}/06_출처링크_한번클릭_원자료.png`, fullPage: true });
});

test.describe("위치 기반 날씨", () => {
  test.describe("기기 위치 허용(부산)", () => {
    test.use({ geolocation: { latitude: 35.1796, longitude: 129.0756 }, permissions: ["geolocation"] });

    test("접속한 기기의 위치로 날씨 위젯과 위치 칩을 바꾼다", async ({ page }) => {
      const widgetRequests: string[] = [];
      page.on("request", (request) => {
        if (/\/api\/widgets\/(weather|weather-forecast|air-quality|sensor-community|kma-weather|airkorea)\?/.test(request.url())) {
          widgetRequests.push(request.url());
        }
      });
      await mockDailyHistory(page);
      await page.route("**/api/place?**", (route) => route.fulfill({ json: { name: "부산 연산5동", sido: "부산" } }));
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");

      const chip = page.getByRole("group", { name: "날씨 기준 위치" });
      await expect(chip).toContainText("부산 연산5동");
      await expect(chip).toContainText("내 위치 기준");
      await expect(page.locator(".tile", { hasText: "부산 연산5동 날씨" })).toBeVisible();
      await expect(page.locator(".tile", { hasText: "에어코리아 부산" })).toBeVisible();
      await expect(page.locator(".tile", { hasText: "서울 날씨" })).toHaveCount(0);

      await expect.poll(() => widgetRequests.some((url) => url.includes("/api/widgets/weather?") && url.includes("lat=35.18") && url.includes("lon=129.08"))).toBe(true);
      // 좌표는 소수 둘째 자리(약 1km)로 줄여서 전달한다
      expect(widgetRequests.every((url) => !/lat=35\.17\d{2}/.test(url))).toBe(true);
      expect(widgetRequests.some((url) => url.includes("/api/widgets/airkorea?") && url.includes("sido=%EB%B6%80%EC%82%B0"))).toBe(true);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/13_위치기반_부산.png` });

      // 선택은 기억된다: 서울로 바꾸면 새로고침해도 서울
      await chip.getByRole("button", { name: "서울로 보기" }).click();
      await expect(chip).toContainText("기본 위치(서울)");
      await expect(page.locator(".tile", { hasText: "서울 날씨" })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("group", { name: "날씨 기준 위치" })).toContainText("기본 위치(서울)");
    });
  });

  test("위치를 쓸 수 없으면 서울 기준으로 표시하고 이유를 알려 준다", async ({ page }) => {
    const widgetRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/widgets/weather")) widgetRequests.push(request.url());
    });
    await mockDailyHistory(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const chip = page.getByRole("group", { name: "날씨 기준 위치" });
    await expect(chip).toContainText("서울");
    await expect(chip).toContainText(/서울 기준|위치 확인|기본 위치/);
    await expect(page.locator(".tile", { hasText: "서울 날씨" })).toBeVisible();
    expect(widgetRequests.every((url) => !url.includes("lat="))).toBe(true);
  });
});

test("8월 1일부터의 과거 기록이 미리 채워지고, 오늘 기록은 실시간으로 이어서 저장된다", async ({ page }) => {
  const historyRequests: string[] = [];
  const days = ["2026-08-01", "2026-08-02", "2026-08-03", "2026-11-02"];
  const points = days.flatMap((date, index) => [
    { metricKey: "weather-temp@37.6,127.0", label: "서울 기온", unit: "°C", date, value: 27 - index, min: 24 - index, max: 31 - index, sourceTimestamp: `${date}T00:00:00.000Z` },
    { metricKey: "usgs-quake-count", label: "전 세계 M2.5+ 지진 수(24h)", unit: "건", date, value: 70 + index, sourceTimestamp: `${date}T00:00:00.000Z` },
  ]);
  await page.route("**/api/history**", async (route) => {
    historyRequests.push(route.request().url());
    await route.fulfill({ json: { from: "2026-08-01", to: "2026-11-02", fetchedAt: "2026-11-03T01:00:00.000Z", points, sources: [{ name: "mock", ok: true, count: points.length }] } });
  });
  await page.route("**/api/widgets/upbit-daily-history", (route) => route.fulfill({ status: 503, json: { error: "disabled" } }));
  // 오늘(실시간) 기록: 현재 시각 기준 한 줄
  await page.route("**/api/widgets/weather", (route) => route.fulfill({ json: {
    value: { headline: "15°C", subline: "서울", metric: { key: "weather-temp@37.6,127.0", label: "서울 기온", value: 15, unit: "°C" } },
    status: "ok", source: { provider: "Open-Meteo", docsUrl: "https://open-meteo.com", endpointTemplate: "GET /v1/forecast" },
    fetchedAt: new Date().toISOString(), cacheAgeMs: 0,
  } }));

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  const log = page.locator(".daily-log");

  await expect.poll(() => historyRequests.length).toBeGreaterThan(0);
  expect(historyRequests[0]).toContain("from=2026-08-01");

  // 가장 오래된 기록은 8월 1일, 최신은 오늘
  await expect(log.getByRole("tab", { name: /08-01/ })).toBeVisible();
  const tabs = log.getByRole("tablist", { name: "기록된 날짜" }).getByRole("tab");
  const today = await page.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()));
  await expect(tabs.first()).toContainText(today.slice(5)); // 오늘이 가장 앞
  await expect(tabs.last()).toContainText("08-01");

  await log.getByRole("tab", { name: /08-01/ }).click();
  const row = log.locator(".range-list li", { hasText: "서울 기온" });
  await expect(row).toContainText("과거 원자료로 자동 채움");
  await expect(row).toContainText("최소 24 °C");
  await expect(row).toContainText("최대 31 °C");

  // 오늘 줄은 과거 채움이 아니라 실시간 기록(표본 수 표시)
  await tabs.first().click();
  await expect(log.locator(".range-list li", { hasText: "서울 기온" })).toContainText("1회 · 마지막 저장");

  // 저장 구조: 같은 지표·날짜는 한 건, 과거는 closed, 오늘은 live
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pulseboard-daily-log-v1") ?? "[]"));
  const temps = stored.filter((entry: { metricKey: string }) => entry.metricKey === "weather-temp@37.6,127.0");
  expect(new Set(temps.map((entry: { id: string }) => entry.id)).size).toBe(temps.length);
  expect(temps.filter((entry: { closed?: boolean }) => entry.closed)).toHaveLength(4);
  expect(temps.find((entry: { date: string }) => entry.date === today)?.closed).toBeFalsy();

  // 새로고침해도 중복되지 않는다
  await page.reload();
  await expect(page.locator(".daily-log").getByRole("tab", { name: /08-01/ })).toBeVisible();
  const again = await page.evaluate(() => JSON.parse(localStorage.getItem("pulseboard-daily-log-v1") ?? "[]"));
  expect(again.filter((entry: { metricKey: string }) => entry.metricKey === "weather-temp@37.6,127.0")).toHaveLength(temps.length);
  await page.locator(".daily-log").screenshot({ path: `${SCREENSHOT_DIR}/14_8월1일부터_미리채움.png` });
});

test("공개 API 계약과 키 비노출 응답을 검증한다", async ({ request }) => {
  const publicEndpoints = ["/api/widgets/upbit-ticker", "/api/widgets/weather", "/api/widgets/holiday"];
  const protectedEndpoints = ["/api/widgets/exchange-rate?currency=USD"];

  // 제거된 API는 더 이상 노출하지 않는다
  for (const removed of ["status", "iss", "kp-index", "usgs-earthquake", "coingecko", "frankfurter-rate", "sensor-community", "lostark-notices", "lostark-market"]) {
    expect((await request.get(`/api/widgets/${removed}`)).status()).toBe(404);
  }

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
  const firstRefresh = page.getByRole("button", { name: "비트코인 새로고침" });
  await expect(firstRefresh).toBeVisible();
  await firstRefresh.click();
  await expect(firstRefresh).toBeDisabled(); // 수동 갱신 10초 쿨다운

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

test("정상 조회값을 KST 날짜별로 자동 저장하고 새로고침 후에도 유지하며 중복 집계하지 않는다", async ({ page }) => {
  const weather = (fetchedAt: string, value: number) => ({
    value: { headline: `${value}°C`, subline: "서울", metric: { key: "weather-seoul-temp", label: "서울 기온", value, unit: "°C" } },
    status: "ok",
    source: { provider: "Open-Meteo", docsUrl: "https://open-meteo.com/en/docs", endpointTemplate: "GET /v1/forecast" },
    fetchedAt,
    cacheAgeMs: 0,
  });
  let call = 0;
  await mockDailyHistory(page);
  await page.route("**/api/widgets/weather", async (route) => {
    call += 1;
    // 첫 응답과 재요청은 같은 fetchedAt(서버 캐시 재사용), 이후는 새 조회
    const body = call <= 2 ? weather("2026-11-03T01:00:00.000Z", 10) : weather("2026-11-03T03:00:00.000Z", 14);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  const log = page.locator(".daily-log");
  await expect(log.getByRole("heading", { name: /2026-11-03/ })).toBeVisible();
  await expect(log.getByRole("tab", { name: /11-03/ })).toHaveAttribute("aria-selected", "true");
  await expect(log.locator(".range-list")).toContainText("서울 기온");
  await log.getByRole("tab", { name: "달력" }).click(); // 달력 히트맵에서도 오늘 칸이 보인다
  await log.getByRole("combobox", { name: "지표 선택" }).selectOption({ label: "서울 기온" });
  await expect(log.locator(".cal__cell--has").first()).toBeVisible();
  await log.getByRole("tab", { name: "추세" }).click();

  const refreshWeather = page.getByRole("button", { name: "서울 날씨 새로고침", exact: true });
  await refreshWeather.click(); // 같은 fetchedAt → 표본 1 유지
  await expect.poll(() => call).toBeGreaterThanOrEqual(2);
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pulseboard-daily-log-v1") ?? "[]"));
  const weatherEntry = () => stored.find((entry: { metricKey: string }) => entry.metricKey === "weather-seoul-temp");
  expect(weatherEntry().samples).toBe(1);

  await refreshWeather.click(); // 새 fetchedAt → 최신 14, 최대 14, 표본 2
  await expect.poll(async () => {
    stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pulseboard-daily-log-v1") ?? "[]"));
    return weatherEntry()?.samples;
  }).toBe(2);
  expect(weatherEntry()).toMatchObject({ date: "2026-11-03", first: 10, latest: 14, min: 10, max: 14 });
  expect(stored.filter((entry: { metricKey: string }) => entry.metricKey === "weather-seoul-temp")).toHaveLength(1);

  await page.reload();
  await expect(page.locator(".daily-log").locator(".range-list")).toContainText("서울 기온");
  // 타일: 스파크라인은 바로 보이고, 오늘 범위(10~14°C, 2회)는 "상세"를 펼치면 보인다
  const card = page.locator(".tile", { hasText: "서울 날씨" }).first();
  await expect(card.locator(".sparkline")).toHaveCount(0); // 하루치뿐이면 선을 그리지 않고 상세 범위로 보여 준다
  await expect(card.getByText(/오늘\(11-03\) 범위/)).toHaveCount(0);
  await card.getByRole("button", { name: /상세/ }).click();
  await expect(card).toContainText("오늘(11-03) 범위 · 2회 기록");
  // 추세 차트: 지표 선택 후 날짜 점 1개
  const log2 = page.locator(".daily-log");
  await log2.getByRole("combobox", { name: "지표 선택" }).selectOption({ label: "서울 기온" });
  await expect(log2.getByRole("img", { name: /서울 기온 날짜별 추세 차트, 1일/ })).toBeVisible();
  await expect(log2.locator(".range-list")).toContainText("최소 10 °C");
  await expect(page.locator(".briefing__tile")).toHaveCount(5);
  await page.locator(".daily-log").screenshot({ path: `${SCREENSHOT_DIR}/08_날짜별_자동기록.png` });
});

test("7일치 기록이 있으면 타임라인·히트맵·범위 막대·추세 차트로 날짜별 기록을 보여준다", async ({ page }) => {
  const days = ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"];
  const series = [
    { key: "weather-temp@37.6,127.0", label: "서울 기온", unit: "°C", base: [12, 14, 11, 9, 13, 16, 15] },
    { key: "airquality-pm25@37.6,127.0", label: "서울 PM2.5(모델)", unit: "μg/m³", base: [22, 41, 58, 33, 18, 27, 44] },
    { key: "upbit-btc-krw", label: "Upbit BTC/KRW", unit: "KRW", base: [101e6, 102.5e6, 100.1e6, 103e6, 104.2e6, 103.4e6, 103.0e6] },
  ];
  const entries = series.flatMap((item) => days.map((date, index) => {
    const latest = item.base[index];
    return {
      id: `${item.key}:${date}`, metricKey: item.key, label: item.label, unit: item.unit, date,
      first: latest * 0.97, latest, min: latest * 0.93, max: latest * 1.06, samples: 6 + index,
      firstAt: `${date}T01:00:00.000Z`, updatedAt: `${date}T09:00:00.000Z`, lastFetchedAt: `${date}T09:00:00.000Z`,
    };
  }));
  await page.addInitScript((value) => {
    localStorage.setItem("pulseboard-daily-log-v1", JSON.stringify(value));
  }, entries);
  // 일봉 자동 채움은 막아 시드한 7일만 보이게 한다
  await page.route("**/api/widgets/upbit-daily-history", (route) => route.fulfill({ status: 503, json: { error: "disabled" } }));
  await blockHistory(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");

  const log = page.locator(".daily-log");
  await expect(log.getByRole("tablist", { name: "기록된 날짜" }).getByRole("tab")).toHaveCount(7);
  await expect(log.getByRole("tab", { name: /11-03/ })).toHaveAttribute("aria-selected", "true");
  await log.getByRole("tab", { name: /10-30/ }).click();
  await expect(log.getByRole("heading", { name: /2026-10-30/ })).toBeVisible();
  await expect(log.locator(".range-list li")).toHaveCount(3);
  // 추세: 지표를 고르면 7일 점이 찍힌다
  await log.getByRole("combobox", { name: "지표 선택" }).selectOption({ label: "서울 PM2.5(모델)" });
  await expect(log.getByRole("img", { name: /서울 PM2\.5\(모델\) 날짜별 추세 차트, 7일/ })).toBeVisible();
  await expect(log.locator(".trend-chart__point")).toHaveCount(7);

  // 달력: 기록 있는 7칸, 칸을 누르면 그날 기록으로 이동
  await log.getByRole("tab", { name: "달력" }).click();
  await expect(log.locator(".cal__cell--has")).toHaveCount(7);
  await log.locator(".cal__cell--has").nth(5).click(); // 11-02
  await expect(log.getByRole("tab", { name: /11-02/ })).toHaveAttribute("aria-selected", "true");
  await expect(log.getByRole("heading", { name: /2026-11-02/ })).toBeVisible();
  await log.locator(".log-views").screenshot({ path: `${SCREENSHOT_DIR}/10_달력_히트맵.png` });

  // 한눈에 보기: 섹션 맨 위의 지표별 카드(현재값·어제 대비·30일 추세), 누르면 추세 탭으로
  expect(await log.locator(".smalls__item").count()).toBeGreaterThanOrEqual(3);
  await expect(log.locator(".smalls__item", { hasText: "서울 PM2.5(모델)" }).locator(".smalls__delta")).toBeVisible();
  await expect(log.locator(".smalls__item", { hasText: "서울 PM2.5(모델)" }).locator(".sparkline")).toBeVisible();
  await log.scrollIntoViewIfNeeded();
  await log.screenshot({ path: `${SCREENSHOT_DIR}/09_날짜별기록_시각화_7일.png` });
  await page.waitForTimeout(1_500); // 등장·그리기 모션이 끝난 뒤 촬영
  await log.locator(".smalls__item", { hasText: "서울 PM2.5(모델)" }).click();
  await expect(log.getByRole("tab", { name: "추세" })).toHaveAttribute("aria-selected", "true");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/10_대시보드_전체_고도화.png`, fullPage: true });

  // 첫 화면(스크롤 전)과 점진적 공개(상세 펼침)
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/11_컴팩트_첫화면.png` });
  const weatherTile = page.locator(".tile", { hasText: "서울 날씨" }).first();
  await expect(weatherTile.locator(".tile__delta")).toBeVisible(); // 직전 기록 대비
  await weatherTile.getByRole("button", { name: /상세/ }).click();
  await weatherTile.screenshot({ path: `${SCREENSHOT_DIR}/12_타일_상세_펼침.png` });
  await page.getByRole("button", { name: /^날씨·대기/ }).click();
  await expect(page.locator(".tile-slot:not([hidden])")).toHaveCount(5);
  await page.getByRole("button", { name: /^생활/ }).click();
  await expect(page.locator(".tile-slot:not([hidden])")).toHaveCount(1);
  await page.getByRole("button", { name: /^시세·환율/ }).click();
  await expect(page.locator(".tile-slot:not([hidden])")).toHaveCount(2);
});

test.describe("상용 수준 마감", () => {
  test("보안 헤더·매니페스트·robots를 제공한다", async ({ request }) => {
    const page = await request.get("/");
    expect(page.headers()["x-content-type-options"]).toBe("nosniff");
    expect(page.headers()["x-frame-options"]).toBe("DENY");
    expect(page.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(page.headers()["permissions-policy"]).toContain("geolocation=(self)");
    expect(page.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(page.headers()["x-powered-by"]).toBeUndefined();

    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({ short_name: "Daylog", display: "standalone", lang: "ko" });
    expect((await request.get("/icon.svg")).ok()).toBeTruthy();
    expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /api/");
  });

  test("메타데이터와 건너뛰기 링크, 키보드 포커스 표시", async ({ page }) => {
    await mockDailyHistory(page);
    await page.goto("/");
    await expect(page).toHaveTitle(/Daylog/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /실시간 정보판/);
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveCount(1);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "본문으로 건너뛰기" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeVisible();
  });

  test("데이터 출처·개인정보 페이지와 404 페이지", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "데이터 출처와 개인정보" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "개인정보는 이렇게 다룹니다" })).toBeVisible();
    await expect(page.getByText("좌표는 소수 둘째 자리")).toBeVisible();
    await expect(page.getByText("비상업적 이용 한정")).toBeVisible(); // 라이선스 제약을 숨기지 않는다
    expect(await page.locator(".about-table tbody tr").count()).toBe(7);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/19_데이터출처_개인정보.png`, fullPage: true });

    const missing = await page.goto("/does-not-exist");
    expect(missing?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "찾는 페이지가 없습니다" })).toBeVisible();
  });

  test("정보판 푸터에서 출처 페이지로 이동한다", async ({ page }) => {
    await mockDailyHistory(page);
    await page.goto("/");
    await page.getByRole("link", { name: "데이터 출처·개인정보" }).click();
    await expect(page).toHaveURL(/\/about$/);
  });

  test("모바일(390px)에서 가로 스크롤 없이 타일과 기록이 맞는다", async ({ page }) => {
    await mockDailyHistory(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.locator(".daily-log")).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/20_모바일_전체.png`, fullPage: true });
  });
});
