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
 * IMPORTANT: this file has an import-time side effect (loading env files,
 * deriving the local Supabase env, and running the hosted-Supabase guard).
 * Import it before reading any `process.env` value it's meant to provide.
 *
 * ---------------------------------------------------------------------
 * SAFETY: never run this suite against a hosted/production Supabase
 * project. `.env.local` on a developer machine holds hosted URLs/keys for
 * this app's real deployments — the e2e suite must not pick those up.
 *
 * Precedence (highest wins):
 *   1. Real process env at process start (an explicit shell export, or
 *      CI's `.github/workflows/ci.yml` `$GITHUB_ENV` step, which already
 *      points at the CI job's own local Supabase stack).
 *   2. Outside CI: this module's own local-Supabase derivation, below —
 *      shells out to `npx supabase status -o env` and remaps the output
 *      onto this app's env var names, exactly matching ci.yml's rename
 *      step (see `deriveLocalSupabaseEnv`). Only fills variables not
 *      already set by (1), which is what makes it win over `.env.local`:
 *      it runs before `loadEnvFiles()` below, so by the time `.env.local`
 *      is loaded, these variables are already set and `loadEnvFiles`'s own
 *      "don't overwrite" rule leaves the local-derived values in place.
 *   3. `.env.local` / `.env` (hosted values on a dev machine).
 *   4. `.demo-credentials.local` (never hosted; local-only demo logins).
 *
 * `assertLocalSupabaseHosts` then aborts the run if, after all of the
 * above, any Supabase URL/DB var still resolves to a non-local host — the
 * one legitimate way that can happen is (1), an explicit override, which
 * is exactly the case this guard exists to catch.
 * ---------------------------------------------------------------------
 */
import { execFileSync } from "node:child_process";
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
      // `in`, not truthiness: an explicitly exported empty value (the local
      // runner blanks provider API keys to force stub mode) must win too.
      if (key in process.env) continue;

      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}

/**
 * Outside CI, fill the Supabase env vars this app expects from the running
 * local `supabase start` stack — mirrors `.github/workflows/ci.yml`'s "Map
 * local Supabase env vars onto app config names" step exactly (see
 * lib/supabase/config.ts and .env.example for the var names). Never
 * overwrites a variable that's already set in `process.env` (see the
 * precedence note above the fold).
 */
const CONTROL_PLANE_WORKDIR = resolve(process.cwd(), "node_modules/.cache/supabase-control-plane");

/** Reads `npx supabase status -o env` for one local stack. */
function readSupabaseStatus(extraArgs: string[], startHint: string): Record<string, string> {
  let output: string;
  try {
    output = execFileSync("npx", ["supabase", "status", "-o", "env", ...extraArgs], {
      cwd: resolve(process.cwd()),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not read local Supabase status (npx supabase status ${extraArgs.join(" ")}). ` +
        `Run \`${startHint}\` first, then re-run the e2e suite. (${detail.split("\n")[0]})`,
    );
  }

  const status: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    status[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }

  for (const key of ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY", "DB_URL"]) {
    if (!status[key]) {
      throw new Error(
        `\`npx supabase status ${extraArgs.join(" ")}\` did not report ${key}. Run \`${startHint}\` first.`,
      );
    }
  }
  return status;
}

function deriveLocalSupabaseEnv() {
  if (process.env.CI) return; // ci.yml already exported these via $GITHUB_ENV

  const alreadySet = (name: string) => Boolean(process.env[name]);
  const SUPABASE_VARS = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "TENANT_SUPABASE_URL",
    "TENANT_SUPABASE_PUBLISHABLE_KEY",
    "TENANT_SUPABASE_SERVICE_ROLE_KEY",
    "TENANT_DB_URL",
    "CONTROL_PLANE_SUPABASE_URL",
    "CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY",
    "CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY",
    "CONTROL_PLANE_DB_URL",
  ];
  if (SUPABASE_VARS.every(alreadySet)) return; // nothing to derive

  const tenant = readSupabaseStatus([], "npx supabase start");
  // The control plane runs as its own local stack (supabase/control-plane),
  // started by supabase/scripts/setup-e2e.sh from this linked workdir.
  const controlPlane = readSupabaseStatus(
    ["--workdir", CONTROL_PLANE_WORKDIR],
    "./supabase/scripts/setup-e2e.sh",
  );

  // Exactly mirrors the env setup-e2e.sh writes for CI.
  const mapped: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: tenant.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: tenant.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: tenant.SERVICE_ROLE_KEY,
    TENANT_SUPABASE_URL: tenant.API_URL,
    TENANT_SUPABASE_PUBLISHABLE_KEY: tenant.ANON_KEY,
    TENANT_SUPABASE_SERVICE_ROLE_KEY: tenant.SERVICE_ROLE_KEY,
    TENANT_DB_URL: tenant.DB_URL,
    // localhost, not 127.0.0.1: distinct cookie name from the tenant stack (see setup-e2e.sh).
    CONTROL_PLANE_SUPABASE_URL: controlPlane.API_URL.replace("//127.0.0.1:", "//localhost:"),
    CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY: controlPlane.ANON_KEY,
    CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY: controlPlane.SERVICE_ROLE_KEY,
    CONTROL_PLANE_DB_URL: controlPlane.DB_URL,
  };

  for (const [key, value] of Object.entries(mapped)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/** Vars whose value is a URL (http(s)://host:port/...). */
const GUARDED_URL_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "TENANT_SUPABASE_URL",
  "CONTROL_PLANE_SUPABASE_URL",
  "SUPABASE_URL",
] as const;

/** Vars whose value is a Postgres connection string (postgresql://host:port/...). */
const GUARDED_DB_URL_VARS = ["TENANT_DB_URL", "CONTROL_PLANE_DB_URL"] as const;

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

/**
 * Aborts the run if any Supabase URL/DB env var points somewhere other than
 * 127.0.0.1/localhost. Never logs the value (it may embed a key or
 * password) — only the name of the offending variable.
 * Escape hatch: `E2E_ALLOW_REMOTE_SUPABASE=1`.
 */
export function assertLocalSupabaseHosts() {
  if (process.env.E2E_ALLOW_REMOTE_SUPABASE === "1") return;

  for (const name of [...GUARDED_URL_VARS, ...GUARDED_DB_URL_VARS]) {
    const value = process.env[name];
    if (!value) continue;

    const host = hostOf(value);
    if (!host || !LOCAL_HOSTS.has(host)) {
      throw new Error(
        `Refusing to run the e2e suite: ${name} does not point at a local Supabase instance ` +
          `(host must be 127.0.0.1 or localhost). This suite must never run against a hosted/production ` +
          `Supabase project. If this is deliberate, set E2E_ALLOW_REMOTE_SUPABASE=1.`,
      );
    }
  }
}

deriveLocalSupabaseEnv();
loadEnvFiles();
// After loading the env files, so a hosted URL from .env.local (e.g. when CI=1
// skips local derivation) is caught too.
assertLocalSupabaseHosts();

export function requireEnv(name: string): string {
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

/** NEXT_PUBLIC_SUPABASE_URL (local Supabase API URL), for direct Admin API calls (e.g. onboarding-flow.spec.ts). */
export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:4201";
}

export function getServiceRoleKey(): string {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function getMailpitUrl(): string {
  return process.env.CHURCHCORE_OPS_MAILPIT_URL ?? "http://127.0.0.1:4205";
}
