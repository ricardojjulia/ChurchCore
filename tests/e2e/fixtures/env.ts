/**
 * Shared env loading for Playwright specs.
 *
 * Loads `.env`, `.env.local`, and `.demo-credentials.local` (in that order)
 * from the repo root into `process.env`, without overwriting a variable
 * that's already set — so CI secrets and anything exported in the shell
 * before `npm run test:e2e` always win over file contents. This is the same
 * loading order the three original specs (church-admin-readiness,
 * member-mobile-foundation, onboarding-flow) each implemented inline;
 * they should migrate to this module instead of duplicating it.
 *
 * IMPORTANT: this file has an import-time side effect (loading env files).
 * Import it before reading any `process.env` value it's meant to provide.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_FILES = [".env", ".env.local", ".demo-credentials.local"];

function loadEnvFiles() {
  for (const file of ENV_FILES) {
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
}

loadEnvFiles();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Set it in .env.local or export it before running the e2e suite ` +
        `(see docs/testing.md for the local values this repo's contract tests expect).`,
    );
  }
  return value;
}

export function getAppUrl(): string {
  return process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4200";
}

export type DemoCredentials = {
  adminEmail: string;
  memberEmail: string;
  secretaryEmail: string;
  pastorEmail: string;
  ministryLeaderEmail: string;
  password: string;
};

/** Throws with a clear message naming the missing var(s) if credentials aren't configured. */
export function getDemoCredentials(): DemoCredentials {
  return {
    adminEmail: requireEnv("CHURCHCORE_OPS_DEMO_ADMIN_EMAIL"),
    memberEmail: requireEnv("CHURCHCORE_OPS_DEMO_MEMBER_EMAIL"),
    secretaryEmail: requireEnv("CHURCHCORE_OPS_DEMO_SECRETARY_EMAIL"),
    pastorEmail: requireEnv("CHURCHCORE_OPS_DEMO_PASTOR_EMAIL"),
    ministryLeaderEmail: requireEnv("CHURCHCORE_OPS_DEMO_MINISTRY_LEADER_EMAIL"),
    password: requireEnv("CHURCHCORE_OPS_DEV_PASSWORD"),
  };
}

export function getCronSecret(): string {
  return requireEnv("CRON_SECRET");
}

export function getUnsubscribeSecret(): string {
  return requireEnv("UNSUBSCRIBE_SECRET");
}

export type WebhookProvider = "stripe" | "sendgrid" | "twilio" | "resend";

/** Env var name each webhook adapter reads its verification secret from — see the adapters under lib/communications/*-adapter.ts and lib/stripe/client.ts. */
const WEBHOOK_SECRET_ENV_VAR: Record<WebhookProvider, string> = {
  stripe: "STRIPE_WEBHOOK_SECRET",
  sendgrid: "SENDGRID_WEBHOOK_VERIFICATION_KEY",
  twilio: "TWILIO_AUTH_TOKEN",
  resend: "RESEND_WEBHOOK_SECRET",
};

export function getWebhookSecret(provider: WebhookProvider): string {
  return requireEnv(WEBHOOK_SECRET_ENV_VAR[provider]);
}

/** TENANT_DB_URL, matching lib/supabase/tenant.ts / audit-rls.mjs / create-dev-users.sh. */
export function getTenantDbUrl(): string {
  return (
    process.env.TENANT_DB_URL ??
    process.env.SUPABASE_DB_URL ??
    "postgresql://postgres:postgres@127.0.0.1:4202/postgres"
  );
}

export function isDemoModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}
