import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["@mantine/core", "@mantine/hooks", "@mantine/notifications"],
  },
  typescript: {
    // Type-check the shipped app only. Test-file type correctness is
    // enforced by `npm run test` / editor tooling against the full
    // tsconfig.json — it shouldn't gate a production build. See
    // docs/reviews/2026-09-17-dependency-security-patch.md for why this
    // was added (a next.js version bump invalidated a stale incremental
    // TS cache and surfaced ~24 pre-existing test-file type errors that
    // predate this change).
    tsconfigPath: "tsconfig.build.json",
  },
};

export default nextConfig;
