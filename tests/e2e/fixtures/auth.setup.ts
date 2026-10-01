/**
 * Playwright "setup" project (Story A brief AC1): signs in as each of the 6
 * identities through the real /sign-in UI and saves its storageState to
 * tests/e2e/.auth/<identity>.json, for the "chromium" project (which
 * depends on this one — see playwright.config.ts) and other specs to load
 * via `test.use({ storageState: authFilePath(id) })`.
 *
 * "super-admin" is sarah@churchcoreops.app, a control-plane platform admin.
 * "church-admin" is nora@graceharbor.church, a church_admin at Grace Harbor
 * with no platform-admin row, so church-admin checks see exactly what a real
 * church admin sees (S1). See fixtures/roles.ts.
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
