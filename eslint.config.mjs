import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // S9: `session.profile.id` is the login (auth) id, never a church
  // profiles.id; reading it as one broke every signed-in write (S7). Use
  // `session.churchProfileId` for profile references and `session.userId`
  // for the login id (e.g. audit actors).
  {
    files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name='id'][object.type='MemberExpression'][object.property.name='profile']",
          message:
            "session.profile.id is the login id, not a church profile id. Use session.churchProfileId (profile references) or session.userId (the login id).",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Node.js CJS scripts — not part of the TS build pipeline.
    "supabase/scripts/**",
  ]),
]);

export default eslintConfig;
