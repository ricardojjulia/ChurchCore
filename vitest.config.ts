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
      "tests/locgov/**/*.test.ts",
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