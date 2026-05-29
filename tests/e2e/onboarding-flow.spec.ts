import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envFiles = [".env", ".env.local", ".demo-credentials.local"];

for (const file of envFiles) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;

  const contents = readFileSync(path, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key]) continue;

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:4201";
const mailpitUrl = process.env.CHURCHCORE_OPS_MAILPIT_URL ?? "http://127.0.0.1:4205";
const adminEmail = process.env.CHURCHCORE_OPS_DEMO_ADMIN_EMAIL;
const demoPassword = process.env.CHURCHCORE_OPS_DEV_PASSWORD;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const onboardingTestPassword = process.env.CHURCHCORE_OPS_E2E_ONBOARDING_PASSWORD ?? "OnboardingE2E!2026";

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/sign-in?redirectTo=%2Fapp");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/app/**");
}

async function setChurchContext(
  page: import("@playwright/test").Page,
  roleId: "church-admin" | "member",
) {
  await page.evaluate(
    ({ appContext }) => {
      document.cookie = `churchcore_ops_app_context=${encodeURIComponent(
        JSON.stringify(appContext),
      )}; path=/; SameSite=Lax`;
    },
    {
      appContext: {
        kind: "church",
        churchId: "11111111-0000-0000-0000-000000000001",
        roleId,
        source: "impersonation",
      },
    },
  );
}

async function waitForInviteMessage(
  request: import("@playwright/test").APIRequestContext,
  recipientEmail: string,
) {
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

    await page.goto("/portal/register?church=grace-harbor");
    await page.getByLabel("First name").fill(firstName);
    await page.getByLabel("Last name").fill(lastName);
    await page.getByLabel("Email").fill(onboardingEmail);
    await page.getByLabel("Phone").fill("555-0199");
    await page.getByRole("button", { name: "Submit request" }).click();

    await expect(page.getByText("Request received")).toBeVisible();
    await expect(page.getByText("Your request was submitted")).toBeVisible();

    await page.context().clearCookies();

    await signIn(page, adminEmail ?? "", demoPassword ?? "");
    await setChurchContext(page, "church-admin");

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

    await signIn(page, onboardingEmail, onboardingTestPassword);
    await setChurchContext(page, "member");
    await page.goto("/app/member");

    await expect(page.getByText("Quick actions")).toBeVisible();
    await expect(page.getByRole("heading", { name: fullName })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/app/member");
  });
});
