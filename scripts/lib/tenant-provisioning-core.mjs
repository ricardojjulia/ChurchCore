/**
 * ChurchCore Ops — Shared Tenant Provisioning Core
 *
 * The actual create-a-client-account logic, factored out so it can be
 * called both by the generic onboarding tool (scripts/provision-tenant.mjs)
 * and by the per-client record scripts it generates (scripts/seed-<slug>.mjs).
 * Keeping one implementation means every client is provisioned the same
 * way and a fix here fixes it everywhere.
 *
 * Steps: auth users -> church -> profiles -> church_memberships ->
 * church_settings -> control-plane tenant + tenant_connections registration.
 */

async function upsert(client, table, rows, onConflict = 'id') {
  if (!rows.length) return;
  const { error } = await client.from(table).upsert(rows, { onConflict, ignoreDuplicates: false });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`  OK   ${table} (${rows.length})`);
}

async function upsertIgnore(client, table, rows, onConflict) {
  if (!rows.length) return;
  const { error } = await client.from(table).upsert(rows, { onConflict, ignoreDuplicates: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`  OK   ${table} (${rows.length})`);
}

async function seedAuthUsers(tenant, churchId, users) {
  console.log('\n[1] Creating auth users...');
  const authIds = {};

  const { data: listData, error: listError } = await tenant.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw new Error(`listUsers: ${listError.message}`);
  const allUsers = listData.users;

  for (const u of users) {
    const existing = allUsers?.find((x) => x.email === u.email);

    if (existing) {
      const { error } = await tenant.auth.admin.updateUserById(existing.id, { password: u.password, email_confirm: true });
      if (error) throw new Error(`updateUserById ${u.email}: ${error.message}`);
      console.log(`  UPDATED ${u.email}`);
      authIds[u.email] = existing.id;
    } else {
      const { data, error } = await tenant.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { full_name: u.fullName, church_id: churchId, role: u.supabaseRole },
      });
      if (error) throw new Error(`createUser ${u.email}: ${error.message}`);
      console.log(`  CREATED ${u.email} (${data.user.id})`);
      authIds[u.email] = data.user.id;
    }
  }

  return authIds;
}

async function seedChurch(tenant, { churchId, churchName, churchSlug, timezone }) {
  console.log('\n[2] Upserting church...');
  await upsert(tenant, 'churches', [{
    id: churchId,
    name: churchName,
    slug: churchSlug,
    timezone,
  }]);
}

async function seedProfiles(tenant, churchId, users, authIds) {
  console.log('\n[3] Upserting profiles...');

  const emails = users.map((u) => u.email);
  await tenant.from('profiles').delete().in('email', emails).eq('church_id', churchId);

  const profiles = users.map((u, i) => ({
    id: u.profileId,
    user_id: authIds[u.email] ?? null,
    church_id: churchId,
    full_name: u.fullName,
    email: u.email,
    phone: u.phone ?? `555-2${String(i + 1).padStart(3, '0')}`,
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
    joined_date: u.joinedDate ?? new Date().toISOString().slice(0, 10),
  }));

  await upsert(tenant, 'profiles', profiles);
}

async function seedMemberships(tenant, churchId, users, authIds) {
  console.log('\n[4] Upserting church_memberships...');

  const memberships = users
    .filter((u) => authIds[u.email])
    .map((u) => ({
      user_id: authIds[u.email],
      church_id: churchId,
      role: u.membershipRole,
      is_active: true,
    }));

  await upsertIgnore(tenant, 'church_memberships', memberships, 'church_id,user_id,role');
}

async function seedChurchSettings(tenant, { churchId, legalName, contactEmail, contactPhone, timezone }) {
  console.log('\n[5] Upserting church_settings...');
  await upsertIgnore(tenant, 'church_settings', [{
    church_id: churchId,
    legal_name: legalName,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    timezone,
  }], 'church_id');
}

async function registerTenant(cp, { churchId, churchName, churchSlug, timezone, cpTenantExternalId }) {
  console.log('\n[6] Registering tenant in control-plane...');

  const { data: existing, error: selectError } = await cp.from('tenants').select('id').eq('slug', churchSlug).maybeSingle();
  if (selectError) throw new Error(`tenants select: ${selectError.message}`);

  let tenantId;
  if (existing) {
    tenantId = existing.id;
    console.log(`  EXISTS tenant ${churchSlug} (${tenantId})`);
  } else {
    const { data, error } = await cp.from('tenants').insert({
      external_tenant_id: cpTenantExternalId,
      name: churchName,
      slug: churchSlug,
      timezone,
      tenant_status: 'active',
      billing_status: 'trialing',
    }).select('id').single();
    if (error) throw new Error(`tenants insert: ${error.message}`);
    tenantId = data.id;
    console.log(`  CREATED tenant ${churchSlug} (${tenantId})`);
  }

  const { data: existingConn, error: connSelectError } = await cp.from('tenant_connections').select('id').eq('tenant_id', tenantId).maybeSingle();
  if (connSelectError) throw new Error(`tenant_connections select: ${connSelectError.message}`);

  if (existingConn) {
    console.log('  EXISTS tenant_connections');
  } else {
    const { error } = await cp.from('tenant_connections').insert({
      tenant_id: tenantId,
      backend_kind: 'supabase',
      connection_status: 'ready',
      metadata: {
        runtime_church_id: churchId,
        runtime_slug: churchSlug,
      },
    });
    if (error) throw new Error(`tenant_connections insert: ${error.message}`);
    console.log('  CREATED tenant_connections');
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} tenant service-role client for the tenant project
 * @param {import('@supabase/supabase-js').SupabaseClient} cp service-role client for the control-plane project
 * @param {object} config
 * @param {string} config.churchId
 * @param {string} config.churchName
 * @param {string} config.churchSlug
 * @param {string} config.timezone
 * @param {string} config.legalName
 * @param {string|null} config.contactEmail
 * @param {string|null} config.contactPhone
 * @param {string} config.cpTenantExternalId
 * @param {Array<object>} config.users role-scoped auth users to create (see seed-*.mjs for shape)
 */
export async function provisionTenant(tenant, cp, config) {
  const authIds = await seedAuthUsers(tenant, config.churchId, config.users);
  await seedChurch(tenant, config);
  await seedProfiles(tenant, config.churchId, config.users, authIds);
  await seedMemberships(tenant, config.churchId, config.users, authIds);
  await seedChurchSettings(tenant, config);
  await registerTenant(cp, config);
}
