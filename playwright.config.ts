import { defineConfig, devices } from "@playwright/test";

// Side-effect import: loads .env/.env.local/.demo-credentials.local, derives
// the local Supabase env from `npx supabase status -o env` outside CI, and
// aborts the whole run if any Supabase URL/DB var doesn't resolve to a local
// host (127.0.0.1/localhost) — see tests/e2e/fixtures/env.ts's file header
// and the Story A brief's "HARD SAFETY GUARD". Runs at config-load time, in
// every Playwright worker process (each re-requires this config module), so
// there's no path through `playwright test` that skips it.
import "./tests/e2e/fixtures/env";

const baseURL = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4200";
const isCI = Boolean(process.env.CI);
// `npm run test:e2e:local` (scripts/e2e-local.sh) builds first and sets this so
// local runs use the production server like CI; `next dev` compiles routes on
// demand and times out under a full parallel run.
const useProductionServer = isCI || process.env.E2E_SERVER === "start";

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
  // Every page request calls the tenant (and, locally, control-plane) auth
  // /user endpoint. Past ~4 parallel workers the local auth containers run out
  // of Postgres connections ("cannot assign requested address") and sessions
  // read as signed out. CI keeps Playwright's default (half the runner cores).
  workers: isCI ? undefined : 4,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  webServer: {
    // CI builds and runs the production server against the local Supabase
    // stack (see .github/workflows/ci.yml's `e2e` job); locally, `npm run
    // dev` against reuseExistingServer lets a developer keep a dev server
    // running across test runs (see docs/testing.md).
    command: useProductionServer ? "npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !useProductionServer,
    timeout: 120_000,
    // Explicit for clarity — this is also Playwright's own default, but the
    // app's Supabase/cron/unsubscribe/webhook secrets (set by the CI job or
    // by whoever started `npm run start` locally) must reach the spawned
    // server process either way.
    env: process.env as Record<string, string>,
  },
  projects: [
    {
      name: "setup",
      testMatch: /fixtures\/auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      // No default storageState here: signed-out specs (onboarding-flow's
      // portal/register start, and part 2's public-page/signed-out sweep
      // cases) need an unauthenticated context by default. Specs/describe
      // blocks that need a signed-in identity opt in explicitly via
      // `test.use({ storageState: authFilePath("<identity>") })` (see
      // tests/e2e/fixtures/roles.ts).
    },
  ],
});
