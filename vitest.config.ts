import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "app/**/*.test.{ts,tsx}",
      "components/**/*.test.{ts,tsx}",
      "lib/**/*.test.{ts,tsx}",
      "tests/**/*.test.{ts,tsx}",
    ],
    // tests/database/** connects to a real Postgres instance
    // (TENANT_DB_URL, defaulting to localhost:4202) and isn't runnable in
    // CI without a provisioned database service. Run via `npm run test:db`
    // locally against `npm run setup:local`, matching how `test:e2e*`
    // already segregates infrastructure-dependent tests from the default
    // fast unit-test run.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
      "tests/database/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "components/application/**/*.tsx",
        "lib/**/*.ts",
      ],
    },
  },
});