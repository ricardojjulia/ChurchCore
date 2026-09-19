#!/usr/bin/env node
/**
 * ChurchCore Ops — Generic Client Account Provisioning
 *
 * THIS is the tool to run when onboarding a new client (church). It seeds a
 * fresh, empty tenant in the tenant Supabase project (church record, one
 * auth user per role you provide an email for, profiles, memberships, and
 * church setup fields) and registers the tenant in the control-plane project's
 * `tenants` / `tenant_connections` tables. Logic lives in
 * scripts/lib/tenant-provisioning-core.mjs, shared with the generated
 * per-client scripts below.
 *
 * On success it also writes scripts/seed-<slug>.mjs — a small,
 * client-specific script with this run's resolved IDs baked in as constants.
 * Commit that password-free file as the permanent, idempotent provisioning
 * record. Re-runs require role-specific passwords so credentials stay outside source
 * control.
 * scripts/seed-casa-refugio.mjs is an existing example of that pattern,
 * predating this generic tool.
 *
 * Required env vars (connection secrets):
 *   TENANT_SUPABASE_URL
 *   TENANT_SUPABASE_SERVICE_ROLE_KEY
 *   CONTROL_PLANE_SUPABASE_URL
 *   CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY
 *
 * Required env vars (client identity):
 *   CHURCH_NAME       e.g. "Sunrise Community Church"
 *   CHURCH_SLUG       kebab-case, e.g. "sunrise-community"
 *   ADMIN_EMAIL       the real church admin's email
 *   ADMIN_FULL_NAME   the real church admin's name
 *
 * Optional env vars:
 *   CHURCH_ID                          auto-generated (uuid) if omitted
 *   TIMEZONE                           default "America/New_York"
 *   LEGAL_NAME                         default "<CHURCH_NAME>, Inc."
 *   CONTACT_EMAIL                      default ADMIN_EMAIL
 *   CONTACT_PHONE
 *   ADMIN_PASSWORD / PASTOR_PASSWORD / SECRETARY_PASSWORD /
 *   LEADER_PASSWORD / MEMBER_PASSWORD  generated independently if omitted
 *   PASTOR_EMAIL / PASTOR_FULL_NAME
 *   SECRETARY_EMAIL / SECRETARY_FULL_NAME
 *   LEADER_EMAIL / LEADER_FULL_NAME
 *   MEMBER_EMAIL / MEMBER_FULL_NAME
 *   (a role beyond admin is only seeded if its *_EMAIL is set)
 *
 * Usage:
 *   TENANT_SUPABASE_URL=https://xxx.supabase.co \
 *   TENANT_SUPABASE_SERVICE_ROLE_KEY=eyJhbGci... \
 *   CONTROL_PLANE_SUPABASE_URL=https://yyy.supabase.co \
 *   CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGci... \
 *   CHURCH_NAME="Sunrise Community Church" CHURCH_SLUG=sunrise-community \
 *   ADMIN_EMAIL=admin@sunrise.church ADMIN_FULL_NAME="Jane Doe" \
 *   node scripts/provision-tenant.mjs
 *
 * Safe to re-run before the client-specific script exists — it's idempotent
 * for the same CHURCH_ID.
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'crypto';
import { writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { provisionTenant } from './lib/tenant-provisioning-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Env: connection secrets ──────────────────────────────────────────────────

const TENANT_URL = process.env.TENANT_SUPABASE_URL;
const TENANT_KEY = process.env.TENANT_SUPABASE_SERVICE_ROLE_KEY;
const CP_URL = process.env.CONTROL_PLANE_SUPABASE_URL;
const CP_KEY = process.env.CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY;

// ── Env: client identity ─────────────────────────────────────────────────────

const CHURCH_NAME = process.env.CHURCH_NAME;
const CHURCH_SLUG = process.env.CHURCH_SLUG;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_FULL_NAME = process.env.ADMIN_FULL_NAME;

for (const [k, v] of Object.entries({
  TENANT_SUPABASE_URL: TENANT_URL,
  TENANT_SUPABASE_SERVICE_ROLE_KEY: TENANT_KEY,
  CONTROL_PLANE_SUPABASE_URL: CP_URL,
  CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY: CP_KEY,
  CHURCH_NAME,
  CHURCH_SLUG,
  ADMIN_EMAIL,
  ADMIN_FULL_NAME,
})) {
  if (!v) { console.error(`Missing required env var: ${k}`); process.exit(1); }
}

if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(CHURCH_SLUG)) {
  console.error('CHURCH_SLUG must be kebab-case, e.g. "sunrise-community"');
  process.exit(1);
}

const outPath = path.join(__dirname, `seed-${CHURCH_SLUG}.mjs`);
if (existsSync(outPath)) {
  console.error(`\nscripts/${path.basename(outPath)} already exists.`);
  console.error(`This client has already been provisioned — run that script directly to re-seed it,`);
  console.error(`don't run the generic tool again for the same CHURCH_SLUG.`);
  process.exit(1);
}

const CHURCH_ID = process.env.CHURCH_ID || randomUUID();
const TIMEZONE = process.env.TIMEZONE || 'America/New_York';
const LEGAL_NAME = process.env.LEGAL_NAME || `${CHURCH_NAME}, Inc.`;
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || ADMIN_EMAIL;
const CONTACT_PHONE = process.env.CONTACT_PHONE || null;
const SLUG_PREFIX = CHURCH_SLUG.split('-').map((w) => w[0]).join('').toUpperCase().slice(0, 4) || 'CH';

const ROLE_DEFS = [
  { supabaseRole: 'church_admin', membershipRole: 'church_admin', displayTitle: 'Church Admin', isPastoral: false, email: ADMIN_EMAIL, fullName: ADMIN_FULL_NAME, passwordEnv: 'ADMIN_PASSWORD' },
  { supabaseRole: 'pastor_elder', membershipRole: 'pastor', displayTitle: 'Pastor', isPastoral: true, email: process.env.PASTOR_EMAIL, fullName: process.env.PASTOR_FULL_NAME, passwordEnv: 'PASTOR_PASSWORD' },
  { supabaseRole: 'secretary', membershipRole: 'secretary', displayTitle: 'Secretary', isPastoral: false, email: process.env.SECRETARY_EMAIL, fullName: process.env.SECRETARY_FULL_NAME, passwordEnv: 'SECRETARY_PASSWORD' },
  { supabaseRole: 'ministry_leader', membershipRole: 'ministry_leader', displayTitle: 'Ministry Leader', isPastoral: false, email: process.env.LEADER_EMAIL, fullName: process.env.LEADER_FULL_NAME, passwordEnv: 'LEADER_PASSWORD' },
  { supabaseRole: 'member_volunteer', membershipRole: 'member', displayTitle: null, isPastoral: false, email: process.env.MEMBER_EMAIL, fullName: process.env.MEMBER_FULL_NAME, passwordEnv: 'MEMBER_PASSWORD' },
];

for (const r of ROLE_DEFS) {
  if (r.email && !r.fullName) {
    console.error(`Missing full name for ${r.email} — every role with an email set also needs its matching *_FULL_NAME env var.`);
    process.exit(1);
  }
}

const USERS = ROLE_DEFS
  .filter((r) => r.email)
  .map((r, i) => ({
    email: r.email,
    password: process.env[r.passwordEnv] || randomBytes(12).toString('base64url'),
    passwordEnv: r.passwordEnv,
    generatedPassword: !process.env[r.passwordEnv],
    supabaseRole: r.supabaseRole,
    membershipRole: r.membershipRole,
    fullName: r.fullName,
    displayTitle: r.displayTitle,
    isPastoral: r.isPastoral,
    profileId: randomUUID(),
    memberNumber: `${SLUG_PREFIX}-D${String(i + 1).padStart(3, '0')}`,
  }));

if (new Set(USERS.map((user) => user.password)).size !== USERS.length) {
  console.error('Every role account must use a distinct password.');
  process.exit(1);
}

const config = {
  churchId: CHURCH_ID,
  churchName: CHURCH_NAME,
  churchSlug: CHURCH_SLUG,
  timezone: TIMEZONE,
  legalName: LEGAL_NAME,
  contactEmail: CONTACT_EMAIL,
  contactPhone: CONTACT_PHONE,
  users: USERS,
  allowTenantRebind: process.env.ALLOW_TENANT_REBIND === 'true',
};

const tenant = createClient(TENANT_URL, TENANT_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const cp = createClient(CP_URL, CP_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

function emitClientScript() {
  const passwordEntries = USERS
    .map((u) => `  ${u.passwordEnv}: process.env.${u.passwordEnv}`)
    .join(',\n');
  const usersLiteral = USERS.map((u) => `  {
    email: ${JSON.stringify(u.email)},
    password: PASSWORDS.${u.passwordEnv},
    supabaseRole: ${JSON.stringify(u.supabaseRole)},
    membershipRole: ${JSON.stringify(u.membershipRole)},
    fullName: ${JSON.stringify(u.fullName)},
    displayTitle: ${JSON.stringify(u.displayTitle)},
    isPastoral: ${u.isPastoral},
    profileId: ${JSON.stringify(u.profileId)},
    memberNumber: ${JSON.stringify(u.memberNumber)},
  }`).join(',\n');

  const contents = `#!/usr/bin/env node
/**
 * ChurchCore Ops — ${CHURCH_NAME} Tenant Seed
 *
 * Generated by scripts/provision-tenant.mjs on ${new Date().toISOString().slice(0, 10)}.
 * This is the permanent, idempotent provisioning record for this client —
 * re-run it any time to restore/repair its baseline accounts. Do NOT use
 * this file as a template for onboarding a *different* client — run
 * scripts/provision-tenant.mjs for that instead.
 *
 * Usage:
 *   TENANT_SUPABASE_URL=https://xxx.supabase.co \\\\
 *   TENANT_SUPABASE_SERVICE_ROLE_KEY=eyJhbGci... \\\\
 *   CONTROL_PLANE_SUPABASE_URL=https://yyy.supabase.co \\\\
 *   CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGci... \\\\
 *   ADMIN_PASSWORD='<temporary-password>' \\\\
 *   # plus the matching *_PASSWORD variable for each additional role \\\\
 *   node scripts/seed-${CHURCH_SLUG}.mjs
 *
 * Fully idempotent — safe to re-run.
 */

import { createClient } from '@supabase/supabase-js';

import { provisionTenant } from './lib/tenant-provisioning-core.mjs';

const TENANT_URL = process.env.TENANT_SUPABASE_URL;
const TENANT_KEY = process.env.TENANT_SUPABASE_SERVICE_ROLE_KEY;
const CP_URL     = process.env.CONTROL_PLANE_SUPABASE_URL;
const CP_KEY     = process.env.CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY;
const PASSWORDS = {
${passwordEntries}
};

for (const [k, v] of Object.entries({ TENANT_SUPABASE_URL: TENANT_URL, TENANT_SUPABASE_SERVICE_ROLE_KEY: TENANT_KEY, CONTROL_PLANE_SUPABASE_URL: CP_URL, CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY: CP_KEY, ...PASSWORDS })) {
  if (!v) { console.error(\`Missing env var: \${k}\`); process.exit(1); }
}
if (new Set(Object.values(PASSWORDS)).size !== Object.values(PASSWORDS).length) {
  console.error('Every role account must use a distinct password.');
  process.exit(1);
}

const tenant = createClient(TENANT_URL, TENANT_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const cp     = createClient(CP_URL,     CP_KEY,     { auth: { autoRefreshToken: false, persistSession: false } });

// ── Stable IDs ────────────────────────────────────────────────────────────────

const CHURCH_ID   = ${JSON.stringify(CHURCH_ID)};
const CHURCH_SLUG = ${JSON.stringify(CHURCH_SLUG)};
const CHURCH_NAME = ${JSON.stringify(CHURCH_NAME)};
const TIMEZONE    = ${JSON.stringify(TIMEZONE)};
const LEGAL_NAME  = ${JSON.stringify(LEGAL_NAME)};
const CONTACT_EMAIL = ${JSON.stringify(CONTACT_EMAIL)};
const CONTACT_PHONE = ${JSON.stringify(CONTACT_PHONE)};

const USERS = [
${usersLiteral}
];

(async () => {
  console.log('=== ${CHURCH_NAME} — Tenant Seed ===');

  await provisionTenant(tenant, cp, {
    churchId: CHURCH_ID,
    churchName: CHURCH_NAME,
    churchSlug: CHURCH_SLUG,
    timezone: TIMEZONE,
    legalName: LEGAL_NAME,
    contactEmail: CONTACT_EMAIL,
    contactPhone: CONTACT_PHONE,
    users: USERS,
    resetExistingPasswords: process.env.RESET_EXISTING_PASSWORDS === 'true',
    allowTenantRebind: process.env.ALLOW_TENANT_REBIND === 'true',
  });

  console.log('\\n=== Done ===');
  console.log('\\nAccounts:');
  for (const u of USERS) {
    console.log(\`  \${u.membershipRole.padEnd(16)} \${u.email}\`);
  }
  console.log(\`\\nChurch ID:  \${CHURCH_ID}\`);
  console.log(\`Slug:       \${CHURCH_SLUG}\`);
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
`;

  writeFileSync(outPath, contents, { mode: 0o755 });
  console.log(`\n[6] Wrote client-specific record: scripts/${path.basename(outPath)}`);
  console.log('    Commit this password-free file as the permanent provisioning record.');
}

(async () => {
  console.log(`=== Provisioning ${CHURCH_NAME} (${CHURCH_SLUG}) ===`);

  emitClientScript();
  await provisionTenant(tenant, cp, config);

  console.log('\n=== Done ===');
  console.log('\nAccounts:');
  for (const u of USERS) {
    console.log(`  ${u.membershipRole.padEnd(16)} ${u.email}`);
  }
  const generatedUsers = USERS.filter((u) => u.generatedPassword);
  if (generatedUsers.length > 0) {
    console.log('\nGenerated temporary passwords (share securely, then rotate):');
    for (const u of generatedUsers) console.log(`  ${u.email}: ${u.password}`);
  }
  console.log(`\nChurch ID:  ${CHURCH_ID}`);
  console.log(`Slug:       ${CHURCH_SLUG}`);
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
