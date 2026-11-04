import { defineConfig } from "@playwright/test";

// Browser tests live in apps/web/e2e as *.e2e.ts, a name `bun test` doesn't pick up.
export default defineConfig({
  testDir: "apps/web/e2e",
  testMatch: "**/*.e2e.ts",
  outputDir: "test-results",
  forbidOnly: !!process.env.CI,
  // Headed Firefox and software WebGL share one runner's display/device resources.
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  use: {
    baseURL: "http://localhost:4320",
    trace: process.env.CI ? { mode: "retain-on-failure", screenshots: false } : "off",
  },
  webServer: {
    command: "bun --cwd apps/web ./dev.ts",
    url: "http://localhost:4320",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    {
      name: "firefox",
      use: {
        browserName: "firefox",
        // Linux headless Firefox has no WebGL display; CI supplies Xvfb and Mesa.
        headless: process.env.CI && process.platform === "linux" ? false : undefined,
      },
    },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
