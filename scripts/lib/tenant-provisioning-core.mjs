/**
 * ChurchCore Ops — Shared Tenant Provisioning Core
 *
 * The actual create-a-client-account logic, factored out so it can be
 * called both by the generic onboarding tool (scripts/provision-tenant.mjs)
 * and by the per-client record scripts it generates (scripts/seed-<slug>.mjs).
 * Keeping one implementation means every client is provisioned the same
 * way and a fix here fixes it everywhere.
 *
 * Steps: auth users -> church/settings -> profiles -> church_memberships ->
 * control-plane tenant + tenant_connections registration.
 */

async function upsert(client, table, rows, onConflict = 'id') {
  if (!rows.length) return;
  const { error } = await client.from(table).upsert(rows, { onConflict, ignoreDuplicates: false });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`  OK   ${table} (${rows.length})`);
}

async function seedAuthUsers(tenant, churchId, users, resetExistingPasswords) {
  console.log('\n[1] Creating auth users...');
  const authIds = {};

  const { data: listData, error: listError } = await tenant.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw new Error(`listUsers: ${listError.message}`);
  const allUsers = listData.users;

  for (const u of users) {
    const existing = allUsers?.find((candidate) => candidate.email === u.email);
    if (!existing) continue;

    const { data: profile, error } = await tenant
      .from('profiles')
      .select('church_id')
      .eq('user_id', existing.id)
      .maybeSingle();
    if (error) throw new Error(`profile ownership ${u.email}: ${error.message}`);
    const metadataChurchId = existing.user_metadata?.church_id;
    if (metadataChurchId && metadataChurchId !== churchId) {
      throw new Error(`Refusing to reuse ${u.email}; Auth metadata belongs to another church.`);
    }
    if (profile?.church_id && profile.church_id !== churchId) {
      throw new Error(`Refusing to reuse ${u.email}; the account belongs to another church.`);
    }
  }

  for (const u of users) {
    const existing = allUsers?.find((x) => x.email === u.email);

    if (existing) {
      const attributes = {
        email_confirm: true,
        user_metadata: {
          ...(existing.user_metadata ?? {}),
          full_name: u.fullName,
          church_id: churchId,
          role: u.supabaseRole,
        },
        ...(resetExistingPasswords ? { password: u.password } : {}),
      };
      const { error } = await tenant.auth.admin.updateUserById(existing.id, attributes);
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

async function seedChurch(tenant, {
  churchId,
  churchName,
  churchSlug,
  timezone,
  legalName,
  contactEmail,
  contactPhone,
}) {
  console.log('\n[2] Upserting church...');
  await upsert(tenant, 'churches', [{
    id: churchId,
    name: churchName,
    slug: churchSlug,
    timezone,
    legal_name: legalName,
    contact_email: contactEmail,
    contact_phone: contactPhone,
  }]);
}

async function seedProfiles(tenant, churchId, users, authIds) {
  console.log('\n[3] Upserting profiles...');

  const profiles = [];
  for (const u of users) {
    const authUserId = authIds[u.email];
    const { data: existing, error } = await tenant
      .from('profiles')
      .select('id,church_id')
      .eq('user_id', authUserId)
      .maybeSingle();
    if (error) throw new Error(`profile lookup ${u.email}: ${error.message}`);
    if (existing?.church_id && existing.church_id !== churchId) {
      throw new Error(`Refusing to move ${u.email}; the profile belongs to another church.`);
    }

    const identityFields = {
      id: existing?.id ?? u.profileId,
      user_id: authUserId,
      church_id: churchId,
    };
    profiles.push(existing?.church_id === churchId ? identityFields : {
      ...identityFields,
      full_name: u.fullName,
      email: u.email,
      role: u.supabaseRole,
      display_title: u.displayTitle,
      is_pastoral: u.isPastoral,
      phone: u.phone ?? null,
      membership_status: 'active',
      account_status: 'active',
      member_number: u.memberNumber,
      is_roster_eligible: u.isRosterEligible ?? false,
      preferred_contact_method: 'email',
      directory_visible: u.directoryVisible ?? false,
      contact_allowed: u.contactAllowed ?? false,
      joined_date: u.joinedDate ?? new Date().toISOString().slice(0, 10),
    });
  }

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

  for (const membership of memberships) {
    const { error } = await tenant
      .from('church_memberships')
      .update({ is_active: false })
      .eq('church_id', churchId)
      .eq('user_id', membership.user_id)
      .neq('role', membership.role);
    if (error) throw new Error(`church_memberships deactivate: ${error.message}`);
  }
  await upsert(tenant, 'church_memberships', memberships, 'church_id,user_id,role');
}

async function validateTenantRegistration(cp, { churchId, churchSlug, allowTenantRebind }) {
  const { data: existing, error } = await cp
    .from('tenants')
    .select('id,external_tenant_id')
    .eq('slug', churchSlug)
    .maybeSingle();
  if (error) throw new Error(`tenants lookup: ${error.message}`);
  if (existing?.external_tenant_id !== undefined &&
      existing.external_tenant_id !== churchId &&
      allowTenantRebind !== true) {
    throw new Error(
      `Refusing to rebind ${churchSlug} from ${existing.external_tenant_id} to ${churchId}.`,
    );
  }
}

async function registerTenant(cp, {
  churchId,
  churchName,
  churchSlug,
  timezone,
  allowTenantRebind,
}) {
  console.log('\n[5] Registering tenant in control-plane...');
  await validateTenantRegistration(cp, { churchId, churchSlug, allowTenantRebind });

  const { data: tenantRow, error: tenantError } = await cp.from('tenants').upsert({
    external_tenant_id: churchId,
    name: churchName,
    slug: churchSlug,
    timezone,
    tenant_status: 'active',
    billing_status: 'trialing',
  }, { onConflict: 'slug' }).select('id').single();
  if (tenantError) throw new Error(`tenants upsert: ${tenantError.message}`);
  console.log(`  OK   tenant ${churchSlug} (${tenantRow.id})`);

  const { error: connectionError } = await cp.from('tenant_connections').upsert({
    tenant_id: tenantRow.id,
    backend_kind: 'supabase',
    connection_status: 'ready',
    metadata: {
      runtime_church_id: churchId,
      runtime_slug: churchSlug,
    },
  }, { onConflict: 'tenant_id' });
  if (connectionError) throw new Error(`tenant_connections upsert: ${connectionError.message}`);
  console.log('  OK   tenant_connections');
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
 * @param {boolean} [config.resetExistingPasswords]
 * @param {boolean} [config.allowTenantRebind]
 * @param {Array<object>} config.users role-scoped auth users to create (see seed-*.mjs for shape)
 */
export async function provisionTenant(tenant, cp, config) {
  await validateTenantRegistration(cp, config);
  const authIds = await seedAuthUsers(
    tenant,
    config.churchId,
    config.users,
    config.resetExistingPasswords === true,
  );
  await seedChurch(tenant, config);
  await seedProfiles(tenant, config.churchId, config.users, authIds);
  await seedMemberships(tenant, config.churchId, config.users, authIds);
  await registerTenant(cp, config);
}
