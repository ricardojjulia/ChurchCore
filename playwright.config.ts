import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4200";
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  webServer: {
    // CI builds and runs the production server against the local Supabase
    // stack (see .github/workflows/ci.yml's `e2e` job); locally, `npm run
    // dev` against reuseExistingServer lets a developer keep a dev server
    // running across test runs (see docs/testing.md).
    command: isCI ? "npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    // Explicit for clarity — this is also Playwright's own default, but the
    // app's Supabase/cron/unsubscribe/webhook secrets (set by the CI job or
    // by whoever started `npm run start` locally) must reach the spawned
    // server process either way.
    env: process.env as Record<string, string>,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
