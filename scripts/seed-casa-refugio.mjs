#!/usr/bin/env node
/**
 * ChurchCore Ops — Casa de Refugio ES Tenant Seed
 *
 * Creates a fresh empty tenant "Casa de Refugio ES" with one auth user per
 * role (church-admin, member, secretary, pastor, ministry-leader) and no
 * operational data (no events, ministries, groups, finance, etc.).
 * Also registers the tenant in the control-plane.
 *
 * Usage:
 *   TENANT_SUPABASE_URL=https://xxx.supabase.co \
 *   TENANT_SUPABASE_SERVICE_ROLE_KEY=eyJhbGci... \
 *   CONTROL_PLANE_SUPABASE_URL=https://yyy.supabase.co \
 *   CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGci... \
 *   node scripts/seed-casa-refugio.mjs
 *
 * Fully idempotent — safe to re-run.
 */

import { createClient } from '@supabase/supabase-js';

// ── Env ────────────────────────────────────────────────────────────────────────

const TENANT_URL     = process.env.TENANT_SUPABASE_URL;
const TENANT_KEY     = process.env.TENANT_SUPABASE_SERVICE_ROLE_KEY;
const CP_URL         = process.env.CONTROL_PLANE_SUPABASE_URL;
const CP_KEY         = process.env.CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY;

for (const [k, v] of Object.entries({ TENANT_SUPABASE_URL: TENANT_URL, TENANT_SUPABASE_SERVICE_ROLE_KEY: TENANT_KEY, CONTROL_PLANE_SUPABASE_URL: CP_URL, CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY: CP_KEY })) {
  if (!v) { console.error(`Missing env var: ${k}`); process.exit(1); }
}

const tenant = createClient(TENANT_URL, TENANT_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const cp     = createClient(CP_URL,     CP_KEY,     { auth: { autoRefreshToken: false, persistSession: false } });

// ── Stable IDs ────────────────────────────────────────────────────────────────

const CHURCH_ID   = '11111111-0000-0000-0000-000000000002';
const CHURCH_SLUG = 'casa-refugio-es';
const DEMO_PW     = 'ChurchCoreDemo2026!';

// Control-plane tenant external ID — distinct from the runtime church_id
const CP_TENANT_EXTERNAL_ID = 'aaaaaaaa-0000-0000-0000-000000000002';

const PROFILE_IDS = {
  admin:     '22222222-0000-0000-0000-200000000001',
  member:    '22222222-0000-0000-0000-200000000002',
  secretary: '22222222-0000-0000-0000-200000000003',
  pastor:    '22222222-0000-0000-0000-200000000004',
  leader:    '22222222-0000-0000-0000-200000000005',
};

const DEMO_USERS = [
  {
    email: 'admin@casarefugio.church',
    password: DEMO_PW,
    supabaseRole: 'church_admin',
    membershipRole: 'church_admin',
    fullName: 'Isabel Torres',
    displayTitle: 'Administradora de la Iglesia',
    isPastoral: false,
    profileId: PROFILE_IDS.admin,
    memberNumber: 'CR-D001',
  },
  {
    email: 'member@casarefugio.church',
    password: DEMO_PW,
    supabaseRole: 'member_volunteer',
    membershipRole: 'member',
    fullName: 'Miguel Pérez',
    displayTitle: null,
    isPastoral: false,
    profileId: PROFILE_IDS.member,
    memberNumber: 'CR-D002',
  },
  {
    email: 'secretary@casarefugio.church',
    password: DEMO_PW,
    supabaseRole: 'secretary',
    membershipRole: 'secretary',
    fullName: 'Rosa Mendoza',
    displayTitle: 'Secretaria',
    isPastoral: false,
    profileId: PROFILE_IDS.secretary,
    memberNumber: 'CR-D003',
  },
  {
    email: 'pastor@casarefugio.church',
    password: DEMO_PW,
    supabaseRole: 'pastor_elder',
    membershipRole: 'pastor',
    fullName: 'José Ramírez',
    displayTitle: 'Pastor Principal',
    isPastoral: true,
    profileId: PROFILE_IDS.pastor,
    memberNumber: 'CR-D004',
  },
  {
    email: 'leader@casarefugio.church',
    password: DEMO_PW,
    supabaseRole: 'ministry_leader',
    membershipRole: 'ministry_leader',
    fullName: 'Ana Flores',
    displayTitle: 'Líder de Ministerio',
    isPastoral: false,
    profileId: PROFILE_IDS.leader,
    memberNumber: 'CR-D005',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsert(client, table, rows, onConflict = 'id') {
  if (!rows.length) return;
  const { error } = await client.from(table).upsert(rows, { onConflict, ignoreDuplicates: false });
  if (error) console.warn(`  WARN ${table}: ${error.message}`);
  else console.log(`  OK   ${table} (${rows.length})`);
}

async function upsertIgnore(client, table, rows, onConflict) {
  if (!rows.length) return;
  const { error } = await client.from(table).upsert(rows, { onConflict, ignoreDuplicates: true });
  if (error) console.warn(`  WARN ${table}: ${error.message}`);
  else console.log(`  OK   ${table} (${rows.length})`);
}

// ── Step 1: Auth users (tenant) ───────────────────────────────────────────────

async function seedAuthUsers() {
  console.log('\n[1] Creating auth users...');
  const authIds = {};

  const { data: { users: allUsers } } = await tenant.auth.admin.listUsers({ perPage: 1000 });

  for (const u of DEMO_USERS) {
    const existing = allUsers?.find(x => x.email === u.email);

    if (existing) {
      await tenant.auth.admin.updateUserById(existing.id, { password: u.password, email_confirm: true });
      console.log(`  UPDATED ${u.email}`);
      authIds[u.email] = existing.id;
    } else {
      const { data, error } = await tenant.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { full_name: u.fullName, church_id: CHURCH_ID, role: u.supabaseRole },
      });
      if (error) { console.warn(`  WARN    ${u.email}: ${error.message}`); }
      else { console.log(`  CREATED ${u.email} (${data.user.id})`); authIds[u.email] = data.user.id; }
    }
  }

  return authIds;
}

// ── Step 2: Church ────────────────────────────────────────────────────────────

async function seedChurch() {
  console.log('\n[2] Upserting church...');
  await upsert(tenant, 'churches', [{
    id: CHURCH_ID,
    name: 'Casa de Refugio ES',
    slug: CHURCH_SLUG,
    timezone: 'America/New_York',
  }]);
}

// ── Step 3: Profiles ──────────────────────────────────────────────────────────

async function seedProfiles(authIds) {
  console.log('\n[3] Upserting profiles...');

  // Delete auto-created profiles from auth trigger before inserting with stable IDs
  const emails = DEMO_USERS.map(u => u.email);
  await tenant.from('profiles').delete().in('email', emails).eq('church_id', CHURCH_ID);

  const profiles = DEMO_USERS.map((u, i) => ({
    id: u.profileId,
    user_id: authIds[u.email] ?? null,
    church_id: CHURCH_ID,
    full_name: u.fullName,
    email: u.email,
    phone: `555-200${i + 1}`,
    role: u.supabaseRole,
    display_title: u.displayTitle,
    is_pastoral: u.isPastoral,
    membership_status: 'active',
    account_status: 'active',
    member_number: u.memberNumber,
    is_roster_eligible: true,
    preferred_contact_method: 'email',
    directory_visible: true,
    contact_allowed: true,
    joined_date: '2024-01-01',
  }));

  await upsert(tenant, 'profiles', profiles);
}

// ── Step 4: Church memberships ────────────────────────────────────────────────

async function seedMemberships(authIds) {
  console.log('\n[4] Upserting church_memberships...');

  const memberships = DEMO_USERS
    .filter(u => authIds[u.email])
    .map(u => ({
      user_id: authIds[u.email],
      church_id: CHURCH_ID,
      role: u.membershipRole,
      is_active: true,
    }));

  await upsertIgnore(tenant, 'church_memberships', memberships, 'church_id,user_id,role');
}

// ── Step 5: Church settings ───────────────────────────────────────────────────

async function seedChurchSettings() {
  console.log('\n[5] Upserting church_settings...');
  await upsertIgnore(tenant, 'church_settings', [{
    church_id: CHURCH_ID,
    legal_name: 'Casa de Refugio ES, Inc.',
    contact_email: 'info@casarefugio.church',
    contact_phone: '555-0300',
    timezone: 'America/New_York',
  }], 'church_id');
}

// ── Step 6: Control-plane tenant registration ─────────────────────────────────

async function registerTenant() {
  console.log('\n[6] Registering tenant in control-plane...');

  // Insert tenant record
  const { data: existing } = await cp.from('tenants').select('id').eq('slug', CHURCH_SLUG).maybeSingle();

  let tenantId;
  if (existing) {
    tenantId = existing.id;
    console.log(`  EXISTS tenant ${CHURCH_SLUG} (${tenantId})`);
  } else {
    const { data, error } = await cp.from('tenants').insert({
      external_tenant_id: CP_TENANT_EXTERNAL_ID,
      name: 'Casa de Refugio ES',
      slug: CHURCH_SLUG,
      timezone: 'America/New_York',
      tenant_status: 'active',
      billing_status: 'trialing',
    }).select('id').single();
    if (error) { console.warn(`  WARN tenants: ${error.message}`); return; }
    tenantId = data.id;
    console.log(`  CREATED tenant ${CHURCH_SLUG} (${tenantId})`);
  }

  // Insert tenant_connection
  const { data: existingConn } = await cp.from('tenant_connections').select('id').eq('tenant_id', tenantId).maybeSingle();
  if (existingConn) {
    console.log(`  EXISTS tenant_connections`);
  } else {
    const { error } = await cp.from('tenant_connections').insert({
      tenant_id: tenantId,
      backend_kind: 'supabase',
      connection_status: 'ready',
      metadata: {
        runtime_church_id: CHURCH_ID,
        runtime_slug: CHURCH_SLUG,
      },
    });
    if (error) console.warn(`  WARN tenant_connections: ${error.message}`);
    else console.log(`  CREATED tenant_connections`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log('=== Casa de Refugio ES — Tenant Seed ===');

  const authIds = await seedAuthUsers();
  await seedChurch();
  await seedProfiles(authIds);
  await seedMemberships(authIds);
  await seedChurchSettings();
  await registerTenant();

  console.log('\n=== Done ===');
  console.log('\nAccounts (password: ChurchCoreDemo2026!):');
  for (const u of DEMO_USERS) {
    console.log(`  ${u.membershipRole.padEnd(16)} ${u.email}  — ${u.fullName}`);
  }
  console.log(`\nChurch ID:  ${CHURCH_ID}`);
  console.log(`Slug:       ${CHURCH_SLUG}`);
})().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
