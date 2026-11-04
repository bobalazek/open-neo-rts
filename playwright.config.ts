import { defineConfig } from "@playwright/test";

// Browser tests live in apps/web/e2e as *.e2e.ts, a name `bun test` doesn't pick up.
export default defineConfig({
  testDir: "apps/web/e2e",
  testMatch: "**/*.e2e.ts",
  outputDir: "test-results",
  forbidOnly: !!process.env.CI,
  // Keep each browser's full gameplay journey on one worker.
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
    // Preserve the existing project name used by engine-specific fixtures.
    { name: "chromium", use: { browserName: "chromium", channel: "chrome" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
