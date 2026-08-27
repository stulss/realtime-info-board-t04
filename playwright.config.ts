import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

process.env.SCREENSHOT_RUN_ID ??= new Date().toISOString().replace(/[:.]/g, "-");
if (!/^[A-Za-z0-9_-]+$/.test(process.env.SCREENSHOT_RUN_ID)) {
  throw new Error("SCREENSHOT_RUN_ID는 영문, 숫자, 밑줄, 하이픈만 사용할 수 있습니다.");
}
const screenshotRunDirectory = resolve("docs/검증스크린샷", process.env.SCREENSHOT_RUN_ID);
if (existsSync(screenshotRunDirectory)) {
  throw new Error(`스크린샷 덮어쓰기 방지: 이미 존재하는 실행 폴더입니다 (${process.env.SCREENSHOT_RUN_ID})`);
}
const remoteBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "");
const localBaseUrl = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: remoteBaseUrl ?? localBaseUrl,
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    },
  },
  webServer: remoteBaseUrl ? undefined : {
    command: "npm.cmd run start -- --hostname 127.0.0.1 --port 3100",
    url: localBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
