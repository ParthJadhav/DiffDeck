import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 7_500 },
  outputDir: "test-results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  use: {
    baseURL: "http://127.0.0.1:4187",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { height: 800, width: 1280 } },
    },
    {
      name: "firefox-core",
      testMatch: /core\.e2e\.ts/,
      use: { ...devices["Desktop Firefox"], viewport: { height: 800, width: 1280 } },
    },
    {
      name: "webkit-core",
      testMatch: /core\.e2e\.ts/,
      use: { ...devices["Desktop Safari"], viewport: { height: 800, width: 1280 } },
    },
  ],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://127.0.0.1:4187/api/session",
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
