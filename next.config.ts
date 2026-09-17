import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["@mantine/core", "@mantine/hooks"],
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

export default nextConfig;
