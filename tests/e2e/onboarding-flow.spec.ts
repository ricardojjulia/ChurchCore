import { expect, test } from "@playwright/test";

import { getAppUrl, getMailpitUrl, getSupabaseUrl } from "./fixtures/env";
import { roles, seedAppContextCookie, signInThroughUi } from "./fixtures/roles";

// Onboarding walks through three distinct identities in sequence (public
// visitor -> church-admin approving the request -> the brand-new member the
// request created), so unlike the other two migrated specs it can't just
// load one identity's storageState — it signs in live at each step, same as
// before, but now through the shared fixtures instead of a duplicated
// inline copy.
const adminEmail = process.env.CHURCHCORE_OPS_DEMO_ADMIN_EMAIL;
const demoPassword = process.env.CHURCHCORE_OPS_DEV_PASSWORD;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const onboardingTestPassword = process.env.CHURCHCORE_OPS_E2E_ONBOARDING_PASSWORD ?? "OnboardingE2E!2026";

async function waitForInviteMessage(
  request: import("@playwright/test").APIRequestContext,
  recipientEmail: string,
) {
  const mailpitUrl = getMailpitUrl();
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const listResponse = await request.get(`${mailpitUrl}/api/v1/messages`);
    if (listResponse.ok()) {
      const payload = (await listResponse.json()) as {
        messages?: Array<Record<string, unknown>>;
      };

      const message = (payload.messages ?? []).find((entry) =>
        JSON.stringify(entry).toLowerCase().includes(recipientEmail.toLowerCase()),
      );

      if (message) {
        return message;
      }
    }

    await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1000));
  }

  throw new Error(`Invite email not found in Mailpit for ${recipientEmail}.`);
}

async function findAuthUserIdByEmail(
  request: import("@playwright/test").APIRequestContext,
  email: string,
) {
  const supabaseUrl = getSupabaseUrl();
  const response = await request.get(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: {
      apikey: serviceRoleKey ?? "",
      Authorization: `Bearer ${serviceRoleKey ?? ""}`,
    },
  });

  if (!response.ok()) {
    throw new Error(`Could not list Supabase auth users (${response.status()}).`);
  }

  const payload = (await response.json()) as {
    users?: Array<{ id: string; email?: string | null }>;
  };

  const match = (payload.users ?? []).find(
    (user) => (user.email ?? "").toLowerCase() === email.toLowerCase(),
  );

  if (!match?.id) {
    throw new Error(`No Supabase auth user found for ${email}.`);
  }

  return match.id;
}

async function setInvitedUserPassword(
  request: import("@playwright/test").APIRequestContext,
  userId: string,
  password: string,
) {
  const supabaseUrl = getSupabaseUrl();
  const response = await request.put(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    headers: {
      apikey: serviceRoleKey ?? "",
      Authorization: `Bearer ${serviceRoleKey ?? ""}`,
      "Content-Type": "application/json",
    },
    data: {
      password,
      email_confirm: true,
    },
  });

  if (!response.ok()) {
    throw new Error(`Could not set password for invited user (${response.status()}).`);
  }
}

test.describe("Portal onboarding browser flow", () => {
  test("submits request, approves invite, and signs in with hydrated member profile", async ({
    page,
    request,
  }) => {
    test.skip(
      !adminEmail || !demoPassword || !serviceRoleKey,
      "Run npm run setup:local first so demo credentials and SUPABASE_SERVICE_ROLE_KEY are available.",
    );

    const timestamp = Date.now();
    const firstName = "Onboard";
    const lastName = `Flow${timestamp.toString().slice(-6)}`;
    const fullName = `${firstName} ${lastName}`;
    const onboardingEmail = `onboarding.e2e.${timestamp}@example.com`;

    // `.first()`: components/portal/portal-register-form.tsx renders each
    // field once, but the page briefly (around hydration) shows a duplicate
    // of the freshly-mounted form before React reconciles it away — a
    // strict-mode locator can catch that transient window.
    await page.goto("/portal/register?church=grace-harbor");
    await page.getByLabel("First name").first().fill(firstName);
    await page.getByLabel("Last name").first().fill(lastName);
    await page.getByLabel("Email").first().fill(onboardingEmail);
    await page.getByLabel("Phone").first().fill("555-0199");
    await page.getByRole("button", { name: "Submit request" }).first().click();

    await expect(page.getByText("Request received")).toBeVisible();
    await expect(page.getByText("Your request was submitted")).toBeVisible();

    await page.context().clearCookies();

    const churchAdmin = roles["church-admin"];
    await seedAppContextCookie(page.context(), getAppUrl(), churchAdmin.appContextSelection!);
    await signInThroughUi(page, {
      email: adminEmail ?? "",
      password: demoPassword ?? "",
      redirectTo: churchAdmin.homePath,
    });

    await page.goto("/app/church-admin/accounts?status=pending");
    const requestEmail = page.getByText(onboardingEmail, { exact: false }).first();
    await expect(requestEmail).toBeVisible();
    await requestEmail
      .locator(
        "xpath=ancestor::div[.//button[normalize-space()='Approve']][1]//button[normalize-space()='Approve']",
      )
      .click();

    await expect(
      page.getByText("Invite sent").or(page.getByText("Request approved")),
    ).toBeVisible();
    await expect(page.getByText(onboardingEmail)).toHaveCount(0);

    await waitForInviteMessage(request, onboardingEmail);

    const invitedUserId = await findAuthUserIdByEmail(request, onboardingEmail);
    await setInvitedUserPassword(request, invitedUserId, onboardingTestPassword);

    await page.context().clearCookies();

    await signInThroughUi(page, {
      email: onboardingEmail,
      password: onboardingTestPassword,
      redirectTo: roles.member.homePath,
    });

    await expect(page.getByText("Quick actions")).toBeVisible();
    await expect(page.getByRole("heading", { name: fullName })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/app/member");
  });
});
