/**
 * Playwright "setup" project (Story A brief AC1): signs in as each of the 6
 * identities through the real /sign-in UI and saves its storageState to
 * tests/e2e/.auth/<identity>.json, for the "chromium" project (which
 * depends on this one — see playwright.config.ts) and other specs to load
 * via `test.use({ storageState: authFilePath(id) })`.
 *
 * sarah@churchcoreops.app is both a control-plane platform admin and a real
 * church_admin at Grace Harbor, so she produces two identities:
 * "super-admin" (control context) and "church-admin" (church context) — see
 * fixtures/roles.ts for how each identity's app context is resolved/seeded.
 */
import { test as setup } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { getAppUrl, requireEnv } from "./env";
import { authFilePath, identityIds, roles, seedAppContextCookie, signInThroughUi } from "./roles";

const password = requireEnv("CHURCHCORE_OPS_DEV_PASSWORD");

for (const identityId of identityIds) {
  const role = roles[identityId];

  setup(`authenticate as ${identityId}`, async ({ page, context }) => {
    const email = requireEnv(role.emailEnvVar);

    if (role.appContextSelection) {
      await seedAppContextCookie(context, getAppUrl(), role.appContextSelection);
    }

    await signInThroughUi(page, { email, password, redirectTo: role.homePath });

    const filePath = authFilePath(identityId);
    mkdirSync(dirname(filePath), { recursive: true });
    await context.storageState({ path: filePath });
  });
}
