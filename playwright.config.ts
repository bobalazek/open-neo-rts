import { defineConfig } from "@playwright/test";

// Browser tests live in apps/web/e2e as *.e2e.ts, a name `bun test` doesn't pick up.
export default defineConfig({
  testDir: "apps/web/e2e",
  testMatch: "**/*.e2e.ts",
  outputDir: "test-results",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
