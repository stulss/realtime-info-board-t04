import { defineConfig } from "@playwright/test";

process.env.SCREENSHOT_RUN_ID ??= new Date().toISOString().replace(/[:.]/g, "-");
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
