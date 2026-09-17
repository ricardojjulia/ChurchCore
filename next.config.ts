import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["@mantine/core", "@mantine/hooks"],
  },
  typescript: {
    // Type-check the shipped app only. Test-file type correctness is
    // enforced by `npm run typecheck` (full tsconfig.json) and CI's
    // "Typecheck" job, not the production build — see PR #136.
    tsconfigPath: "tsconfig.build.json",
  },
};

export default nextConfig;
