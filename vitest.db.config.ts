import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Config for tests/database/** -- integration tests that connect to a real
// Postgres instance (TENANT_DB_URL, defaulting to localhost:4202). Run via
// `npm run test:db` after `npm run setup:local`. Excluded from the default
// `npm run test` / CI run (see vitest.config.ts) since no database service
// is provisioned there.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: false,
    include: ["tests/database/**/*.test.ts"],
  },
});
