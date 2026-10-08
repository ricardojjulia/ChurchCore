import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["@mantine/core", "@mantine/hooks"],
    // Vercel rejects function request bodies over 4.5 MB; Next's default for
    // server actions is 1 MB. 4 MB leaves room under Vercel's cap, and the CSV
    // import actions check 3.5 MB of text (see their MAX_IMPORT_BYTES) so the
    // serialized action payload still fits.
    serverActions: { bodySizeLimit: "4mb" },
  },
  typescript: {
    // Type-check the shipped app only. Test-file type correctness is
    // enforced separately by `npm run typecheck` (full tsconfig.json,
    // wired into `npm run check` / CI's Verify step) — it shouldn't gate
    // a production build on its own. See
    // docs/reviews/2026-09-17-dependency-security-patch.md for why this
    // was added (a next.js version bump invalidated a stale incremental
    // TS cache and surfaced ~24 pre-existing test-file type errors that
    // predate this change; all fixed, see that doc for the list).
    tsconfigPath: "tsconfig.build.json",
  },
};

// withSentryConfig no-ops (returns nextConfig unchanged, no build-time
// wrapping) when SENTRY_ORG/SENTRY_PROJECT aren't set, so this is safe
// without Sentry configured -- see docs/setup/observability.md.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
    // This app has Vercel cron jobs (shepherd-ai, communications-retry) --
    // register them as Sentry Cron Monitors automatically if configured.
    automaticVercelMonitors: true,
  },
});
