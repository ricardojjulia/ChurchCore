-- ============================================================
-- ChurchForge local development seed
-- Run automatically by: supabase db reset
--
-- Requires auth users to exist first. Create them with:
--   supabase/scripts/create-dev-users.sh
-- Or via the sign-up form after starting the dev server.
--
-- Auth user IDs are looked up by email so this seed is
-- idempotent even if users are recreated with new UUIDs.
-- ============================================================

do $$
declare
  v_sarah_id    uuid;
  v_david_id    uuid;
  v_church_id   uuid;
  v_tenant_id   uuid;
begin

  -- ── Auth user lookups ────────────────────────────────────
  select id into v_sarah_id
  from auth.users
  where email = 'sarah@churchforge.app'
  limit 1;

  select id into v_david_id
  from auth.users
  where email = 'david@graceharbor.church'
  limit 1;

  -- Skip seed if accounts don't exist yet
  if v_sarah_id is null or v_david_id is null then
    raise notice 'Dev auth users not found — skipping seed. Create them first.';
    return;
  end if;

  -- ── Church ──────────────────────────────────────────────
  insert into public.churches (id, name, slug, timezone)
  values (
    '11111111-0000-0000-0000-000000000001',
    'Grace Harbor Church',
    'grace-harbor',
    'America/New_York'
  )
  on conflict (id) do nothing;

  v_church_id := '11111111-0000-0000-0000-000000000001';

  -- ── Platform admin (sarah — control-plane access) ────────
  insert into public.platform_admins (user_id)
  values (v_sarah_id)
  on conflict (user_id) do nothing;

  -- ── Sarah's church profile (church_admin role) ──────────
  insert into public.profiles (
    id, user_id, church_id, full_name, email, role,
    display_title, membership_status
  )
  values (
    '22222222-0000-0000-0000-000000000001',
    v_sarah_id,
    v_church_id,
    'Sarah Mitchell',
    'sarah@churchforge.app',
    'church_admin',
    'Church Administrator',
    'active'
  )
  on conflict do nothing;

  update public.profiles
  set user_id      = v_sarah_id,
      full_name    = 'Sarah Mitchell',
      display_title = 'Church Administrator',
      role         = 'church_admin'
  where email = 'sarah@churchforge.app';

  -- ── David's profile (member role) ───────────────────────
  insert into public.profiles (
    id, user_id, church_id, full_name, email, role,
    display_title, membership_status
  )
  values (
    '22222222-0000-0000-0000-000000000002',
    v_david_id,
    v_church_id,
    'David Chen',
    'david@graceharbor.church',
    'member_volunteer',
    null,
    'active'
  )
  on conflict do nothing;

  update public.profiles
  set user_id       = v_david_id,
      full_name     = 'David Chen',
      role          = 'member_volunteer'
  where email = 'david@graceharbor.church';

  -- ── Church memberships ──────────────────────────────────
  insert into public.church_memberships (user_id, church_id, role, is_active)
  values
    (v_sarah_id, v_church_id, 'church_admin', true),
    (v_david_id, v_church_id, 'member',       true)
  on conflict (church_id, user_id, role) do update
    set is_active = excluded.is_active;

  -- ── Tenant registry (mirrors church for control-plane) ──
  insert into public.tenants (
    id, external_tenant_id, name, slug, timezone,
    tenant_status, billing_status
  )
  values (
    '33333333-0000-0000-0000-000000000001',
    v_church_id,
    'Grace Harbor Church',
    'grace-harbor',
    'America/New_York',
    'active',
    'trialing'
  )
  on conflict (id) do nothing;

  v_tenant_id := '33333333-0000-0000-0000-000000000001';

  insert into public.tenant_connections (
    tenant_id, backend_kind, connection_status, db_url, metadata
  )
  values (
    v_tenant_id,
    'supabase',
    'ready',
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    jsonb_build_object(
      'bootstrap_source',    'seed',
      'external_tenant_id',  v_church_id,
      'runtime_church_id',   v_church_id,
      'runtime_slug',        'grace-harbor'
    )
  )
  on conflict (tenant_id) do nothing;

  -- ── Sample ministries ────────────────────────────────────
  insert into public.ministries (id, church_id, name, slug, ministry_type, vision_statement)
  values
    (
      '44444444-0000-0000-0000-000000000001',
      v_church_id,
      'Worship Team',
      'worship-team',
      'worship',
      'To lead the congregation into the presence of God through Spirit-led worship.'
    ),
    (
      '44444444-0000-0000-0000-000000000002',
      v_church_id,
      'Community Outreach',
      'community-outreach',
      'outreach',
      'Serving our city with the hands and feet of Jesus.'
    )
  on conflict (id) do nothing;

  raise notice 'Seed complete — Grace Harbor Church, sarah (admin), david (member).';
end $$;
