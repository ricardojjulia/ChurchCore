#!/usr/bin/env node
/**
 * One-off: re-sends donation receipts that never went out (G5.1).
 *
 * Targets succeeded donations with receipt_sent_at null and a donor email,
 * left unsent while no email provider was configured. Each receipt goes
 * through the same code as a live gift (lib/stripe/donation-completion.ts
 * `deliverDonationReceipt`): the same content, claim/lease and sent marker, so
 * running it twice, or while the Stripe webhook runs, never sends twice.
 *
 * Dry run by default: it prints the target host and counts only (never an
 * email address or a name). Pass --apply to send. It refuses to run when no
 * email provider is configured (Resend: RESEND_API_KEY + RESEND_FROM_EMAIL;
 * SendGrid: SENDGRID_API_KEY + SENDGRID_FROM_EMAIL), so it never stubs a send.
 *
 *   TENANT_SUPABASE_URL=... TENANT_SUPABASE_PUBLISHABLE_KEY=... \
 *   TENANT_SUPABASE_SERVICE_ROLE_KEY=... \
 *   RESEND_API_KEY=... RESEND_FROM_EMAIL=... \
 *   node scripts/resend-unsent-receipts.mjs [--apply]
 *
 * The receipt code is TypeScript with `@/` imports and `server-only`, so this
 * loads it with jiti (a transitive dependency of eslint, so devDependencies must
 * be installed: run it from a checkout), with `@` aliased to the repo root and
 * `server-only` stubbed. UNSUBSCRIBE_SECRET isn't needed (receipts bypass the queue).
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseArgs(argv) {
  const apply = argv.includes("--apply");
  const unknown = argv.filter((a) => a !== "--apply");
  if (unknown.length) throw new Error(`Unknown argument: ${unknown[0]}. Usage: resend-unsent-receipts.mjs [--apply]`);
  return { apply };
}

export function emailProviderConfigured(env) {
  return Boolean(
    (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) || (env.SENDGRID_API_KEY && env.SENDGRID_FROM_EMAIL),
  );
}

export function targetHost(env) {
  const url = env.TENANT_SUPABASE_URL || env.NEXT_PUBLIC_TENANT_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("TENANT_SUPABASE_URL is required.");
  return new URL(url).host;
}

export async function main(argv = process.argv.slice(2), env = process.env, log = console.log) {
  const { apply } = parseArgs(argv);
  if (!emailProviderConfigured(env)) {
    throw new Error(
      "No email provider is configured (set RESEND_API_KEY + RESEND_FROM_EMAIL, or SENDGRID_API_KEY + SENDGRID_FROM_EMAIL). Refusing to run.",
    );
  }
  const host = targetHost(env);
  log(`Target: ${host} (${apply ? "APPLY" : "dry run"})`);

  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: { "@": root, "server-only": path.join(root, "scripts/lib/empty-module.mjs") },
  });
  const { createTenantAdminClient } = await jiti.import(path.join(root, "lib/supabase/tenant.ts"));
  const { resendUnsentReceipts } = await jiti.import(path.join(root, "lib/stripe/resend-unsent-receipts.ts"));

  const result = await resendUnsentReceipts(createTenantAdminClient(), { apply });
  log(`Candidates (succeeded, receipt unsent, donor email on file): ${result.candidates}`);
  if (apply) {
    log(`Sent: ${result.sent}  Left unsent (no provider): ${result.notConfigured}  Failed: ${result.failed}`);
  } else {
    log("Dry run: nothing sent. Re-run with --apply to send.");
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
