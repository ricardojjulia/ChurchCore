-- ============================================================
-- ChurchCore Ops local development seed
-- Run automatically by: supabase db reset
--
-- Requires auth users to exist first. Create them with:
--   supabase/scripts/create-dev-users.sh
-- Or via the Supabase Admin API (see churchcore-ops-supabasesetup.md).
--
-- Auth user IDs are looked up by email so this seed is
-- idempotent even if users are recreated with new UUIDs.
-- ============================================================

do $$
declare
  -- auth.users IDs (looked up at runtime)
  v_sarah_auth_id  uuid;
  v_david_auth_id  uuid;
  -- profiles IDs (looked up after upsert)
  v_sarah_id    uuid;
  v_david_id    uuid;
  v_church_id   uuid;
  v_tenant_id   uuid;

  -- ministry IDs
  v_worship_id     uuid := '44444444-0000-0000-0000-000000000001';
  v_men_id         uuid := '44444444-0000-0000-0000-000000000002';
  v_women_id       uuid := '44444444-0000-0000-0000-000000000003';
  v_marriage_id    uuid := '44444444-0000-0000-0000-000000000004';
  v_missions_id    uuid := '44444444-0000-0000-0000-000000000005';
  v_outreach_id    uuid := '44444444-0000-0000-0000-000000000006';
  v_children_id    uuid := '44444444-0000-0000-0000-000000000007';
  v_youth_id       uuid := '44444444-0000-0000-0000-000000000008';
  v_youngadult_id  uuid := '44444444-0000-0000-0000-000000000009';
  v_education_id   uuid := '44444444-0000-0000-0000-000000000010';

  -- milestone IDs for youth track
  v_ms_baptism_id   uuid := '55555555-0000-0000-0000-000000000001';
  v_ms_firstserve_id uuid := '55555555-0000-0000-0000-000000000002';
  v_ms_faithclass_id uuid := '55555555-0000-0000-0000-000000000003';
  v_ms_leadership_id uuid := '55555555-0000-0000-0000-000000000004';

  -- extra profile IDs for richer demo data
  v_james_id     uuid := '22222222-0000-0000-0000-000000000003';
  v_aisha_id     uuid := '22222222-0000-0000-0000-000000000004';
  v_robert_id    uuid := '22222222-0000-0000-0000-000000000005';
  v_marcus_id    uuid := '22222222-0000-0000-0000-000000000006';
  v_linda_id     uuid := '22222222-0000-0000-0000-000000000007';
  v_grace_id     uuid := '22222222-0000-0000-0000-000000000008';
  v_elena_id     uuid := '22222222-0000-0000-0000-000000000009';
  v_carlos_id    uuid := '22222222-0000-0000-0000-000000000010';
  v_maya_id      uuid := '22222222-0000-0000-0000-000000000011';
  v_noah_id      uuid := '22222222-0000-0000-0000-000000000012';
  v_olivia_id    uuid := '22222222-0000-0000-0000-000000000013';
  v_ethan_id     uuid := '22222222-0000-0000-0000-000000000014';
  v_chloe_id     uuid := '22222222-0000-0000-0000-000000000015';
  v_samuel_id    uuid := '22222222-0000-0000-0000-000000000016';
  v_priya_id     uuid := '22222222-0000-0000-0000-000000000017';
  v_ben_id       uuid := '22222222-0000-0000-0000-000000000018';
  v_rachel_id    uuid := '22222222-0000-0000-0000-000000000019';
  v_thomas_id    uuid := '22222222-0000-0000-0000-000000000020';
  v_nadia_id     uuid := '22222222-0000-0000-0000-000000000021';
  v_peter_id     uuid := '22222222-0000-0000-0000-000000000022';

  -- household IDs
  v_mitchell_family_id uuid := '66666666-0000-0000-0000-000000000001';
  v_chen_family_id     uuid := '66666666-0000-0000-0000-000000000002';
  v_ortega_family_id   uuid := '66666666-0000-0000-0000-000000000003';
  v_james_family_id    uuid := '66666666-0000-0000-0000-000000000004';
  v_nguyen_family_id   uuid := '66666666-0000-0000-0000-000000000005';
  v_martinez_family_id uuid := '66666666-0000-0000-0000-000000000006';
  v_hopper_family_id   uuid := '66666666-0000-0000-0000-000000000007';
  v_patel_family_id    uuid := '66666666-0000-0000-0000-000000000008';

  -- event IDs
  v_sunday_event_id    uuid := '77777777-0000-0000-0000-000000000001';
  v_youth_event_id     uuid := '77777777-0000-0000-0000-000000000002';
  v_outreach_event_id  uuid := '77777777-0000-0000-0000-000000000003';
  v_class_event_id     uuid := '77777777-0000-0000-0000-000000000004';
  v_marriage_event_id  uuid := '77777777-0000-0000-0000-000000000005';

begin

  -- ── Auth user lookups ────────────────────────────────────
  select id into v_sarah_auth_id
  from auth.users
  where email = 'sarah@churchcoreops.app'
  limit 1;

  select id into v_david_auth_id
  from auth.users
  where email = 'david@graceharbor.church'
  limit 1;

  -- Skip seed if accounts don't exist yet
  if v_sarah_auth_id is null or v_david_auth_id is null then
    raise notice 'Dev auth users not found — skipping seed. Create them first.';
    return;
  end if;

  -- ── Church ──────────────────────────────────────────────
  v_church_id := '11111111-0000-0000-0000-000000000001';

  -- Keep reruns deterministic by clearing generated demo rows before
  -- repopulating them. Stable records below still use explicit IDs/upserts.
  delete from public.ccm_incidents where church_id = v_church_id;
  delete from public.ccm_volunteer_assignments where church_id = v_church_id;
  delete from public.ccm_authorized_pickups where church_id = v_church_id;
  delete from public.ccm_checkin_sessions where church_id = v_church_id;
  delete from public.ccm_services where church_id = v_church_id;
  delete from public.donations where church_id = v_church_id;
  delete from public.communication_logs where church_id = v_church_id;
  delete from public.care_assignments where church_id = v_church_id;
  delete from public.account_requests where church_id = v_church_id;
  delete from public.event_registrations where church_id = v_church_id;
  delete from public.event_rosters where church_id = v_church_id;
  delete from public.event_registration_settings where church_id = v_church_id;
  delete from public.events where church_id = v_church_id;
  delete from public.marriage_pulse_entries where church_id = v_church_id;
  delete from public.outreach_events where church_id = v_church_id;
  delete from public.education_enrollments where church_id = v_church_id;
  delete from public.education_courses where church_id = v_church_id;
  delete from public.young_adult_career_mentorships where church_id = v_church_id;
  delete from public.children_checkins where church_id = v_church_id;
  delete from public.kingdom_impacts where church_id = v_church_id;
  delete from public.ministry_health_history where church_id = v_church_id;

  insert into public.churches (id, name, slug, timezone)
  values (v_church_id, 'Grace Harbor Church', 'grace-harbor', 'America/New_York')
  on conflict (id) do nothing;

  -- ── Households ───────────────────────────────────────────
  insert into public.families (id, church_id, family_name, address, home_phone)
  values
    (v_mitchell_family_id, v_church_id, 'Mitchell Household', '14 Harbor Green, Brighton, MI', '555-0101'),
    (v_chen_family_id,     v_church_id, 'Chen Household',     '28 Harbor Green, Brighton, MI', '555-0102'),
    (v_ortega_family_id,   v_church_id, 'Ortega Household',   '103 River Road, Brighton, MI',  '555-0103'),
    (v_james_family_id,    v_church_id, 'James Household',    '88 Willow Lane, Brighton, MI',  '555-0104'),
    (v_nguyen_family_id,   v_church_id, 'Nguyen Household',   '7 Maple Court, Brighton, MI',   '555-0105'),
    (v_martinez_family_id, v_church_id, 'Martinez Household', '41 Lakeside Drive, Brighton, MI','555-0106'),
    (v_hopper_family_id,   v_church_id, 'Hopper Household',   '19 Orchard Street, Brighton, MI','555-0107'),
    (v_patel_family_id,    v_church_id, 'Patel Household',    '5 Mission Way, Brighton, MI',   '555-0108')
  on conflict (id) do update set
    family_name = excluded.family_name,
    address = excluded.address,
    home_phone = excluded.home_phone;

  -- ── Profiles ────────────────────────────────────────────
  -- Upsert by email (the unique constraint) to handle auto-created profiles
  -- from the on_auth_user_created trigger. We use a temporary table to stage
  -- data, then update the known-email rows and insert new ones.

  -- Update or insert sarah
  update public.profiles
  set user_id = v_sarah_auth_id, church_id = v_church_id, full_name = 'Sarah Mitchell',
      role = 'church_admin', display_title = 'Church Administrator', membership_status = 'active',
      family_id = v_mitchell_family_id, phone = '555-1101', address = '14 Harbor Green, Brighton, MI',
      member_number = coalesce(member_number, 'GH-0001'), account_status = 'active',
      is_roster_eligible = true
  where email = 'sarah@churchcoreops.app';

  select id into v_sarah_id from public.profiles where email = 'sarah@churchcoreops.app' limit 1;

  -- Update or insert david
  update public.profiles
  set user_id = v_david_auth_id, church_id = v_church_id, full_name = 'David Chen',
      role = 'member_volunteer', membership_status = 'active',
      family_id = v_chen_family_id, phone = '555-1102', address = '28 Harbor Green, Brighton, MI',
      member_number = coalesce(member_number, 'GH-0002'), account_status = 'active',
      is_roster_eligible = true
  where email = 'david@graceharbor.church';

  select id into v_david_id from public.profiles where email = 'david@graceharbor.church' limit 1;

  -- Extra demo profiles (no auth user required)
  insert into public.profiles (
    id, church_id, full_name, email, phone, address, role, display_title,
    membership_status, family_id, member_number, account_status, is_roster_eligible,
    preferred_contact_method, directory_visible, contact_allowed, joined_date
  )
  values
    (v_james_id,  v_church_id, 'James Ortega',    'james@graceharbor.church',   '555-1103', '103 River Road, Brighton, MI',   'member_volunteer',  'Worship Leader',          'active',      v_ortega_family_id,   'GH-0003', 'active',   true, 'email', true, true, '2022-09-18'),
    (v_aisha_id,  v_church_id, 'Aisha Thompson',  'aisha@graceharbor.church',   '555-1104', '120 Pine Street, Brighton, MI',  'member_volunteer',  null,                      'active',      null,                 'GH-0004', 'active',   true, 'sms',   true, true, '2023-01-22'),
    (v_robert_id, v_church_id, 'Robert James',    'robert@graceharbor.church',  '555-1105', '88 Willow Lane, Brighton, MI',   'ministry_leader',   'Men''s Ministry Leader',  'active',      v_james_family_id,    'GH-0005', 'active',   true, 'email', true, true, '2021-06-13'),
    (v_marcus_id, v_church_id, 'Marcus Williams', 'marcus@graceharbor.church',  '555-1106', '31 Cedar Court, Brighton, MI',   'member_volunteer',  null,                      'active',      null,                 'GH-0006', 'active',   true, 'sms',   true, true, '2023-11-05'),
    (v_linda_id,  v_church_id, 'Linda Nguyen',    'linda@graceharbor.church',   '555-1107', '7 Maple Court, Brighton, MI',    'ministry_leader',   'Women''s Ministry Lead',  'active',      v_nguyen_family_id,   'GH-0007', 'active',   true, 'email', true, true, '2020-04-19'),
    (v_grace_id,  v_church_id, 'Grace Adeyemi',   'grace@graceharbor.church',   '555-1108', '55 Summit Avenue, Brighton, MI', 'member_volunteer',  null,                      'active',      null,                 'GH-0008', 'active',   true, 'email', true, true, '2024-02-04'),
    (v_elena_id,  v_church_id, 'Elena Martinez',  'elena@graceharbor.church',   '555-1109', '41 Lakeside Drive, Brighton, MI','member_volunteer',  'Hospitality Coordinator', 'active',      v_martinez_family_id, 'GH-0009', 'active',   true, 'email', true, true, '2022-02-27'),
    (v_carlos_id, v_church_id, 'Carlos Martinez', 'carlos@graceharbor.church',  '555-1110', '41 Lakeside Drive, Brighton, MI','member_volunteer',  null,                      'active',      v_martinez_family_id, 'GH-0010', 'active',   true, 'sms',   true, true, '2022-02-27'),
    (v_maya_id,   v_church_id, 'Maya Martinez',   'maya@graceharbor.church',    null,       '41 Lakeside Drive, Brighton, MI','member_volunteer',  null,                      'active',      v_martinez_family_id, 'GH-0011', 'pending',  true, 'app',   true, true, '2025-09-07'),
    (v_noah_id,   v_church_id, 'Noah Brooks',     'noah@graceharbor.church',    '555-1112', null,                            'member_volunteer',  null,                      'visitor',     null,                 'GH-0012', 'pending',  true, 'email', true, true, '2026-04-12'),
    (v_olivia_id, v_church_id, 'Olivia Reed',     'olivia@graceharbor.church',  '555-1113', '19 Orchard Street, Brighton, MI','member_volunteer',  'Children''s Volunteer',   'active',      v_hopper_family_id,   'GH-0013', 'active',   true, 'email', true, true, '2021-08-15'),
    (v_ethan_id,  v_church_id, 'Ethan Reed',      'ethan@graceharbor.church',   '555-1114', '19 Orchard Street, Brighton, MI','member_volunteer',  null,                      'active',      v_hopper_family_id,   'GH-0014', 'active',   true, 'sms',   true, true, '2021-08-15'),
    (v_chloe_id,  v_church_id, 'Chloe Brooks',    'chloe@graceharbor.church',   null,       null,                            'member_volunteer',  null,                      'visitor',     null,                 'GH-0015', 'pending',  false,'email', false,true, '2026-04-26'),
    (v_samuel_id, v_church_id, 'Samuel Price',    'samuel@graceharbor.church',  '555-1116', '70 Hillcrest, Brighton, MI',     'member_volunteer',  'Prayer Team Lead',        'active',      null,                 'GH-0016', 'active',   true, 'email', true, false,'2020-10-11'),
    (v_priya_id,  v_church_id, 'Priya Patel',     'priya@graceharbor.church',   '555-1117', '5 Mission Way, Brighton, MI',    'member_volunteer',  'Missions Coordinator',    'active',      v_patel_family_id,    'GH-0017', 'active',   true, 'email', true, true, '2023-05-21'),
    (v_ben_id,    v_church_id, 'Ben Patel',       'ben@graceharbor.church',     '555-1118', '5 Mission Way, Brighton, MI',    'member_volunteer',  null,                      'active',      v_patel_family_id,    'GH-0018', 'active',   true, 'sms',   true, true, '2023-05-21'),
    (v_rachel_id, v_church_id, 'Rachel Kim',      'rachel@graceharbor.church',  '555-1119', '9 Elm Street, Brighton, MI',     'member_volunteer',  null,                      'inactive',    null,                 'GH-0019', 'disabled', false,'none',  false,false,'2019-03-10'),
    (v_thomas_id, v_church_id, 'Thomas Walker',   'thomas@graceharbor.church',  '555-1120', '64 Parkside, Brighton, MI',      'member_volunteer',  'Small Group Coach',       'transferred', null,                 'GH-0020', 'active',   false,'email', false,true, '2018-12-02'),
    (v_nadia_id,  v_church_id, 'Nadia Hassan',    'nadia@graceharbor.church',   '555-1121', '11 Lakeview, Brighton, MI',      'member_volunteer',  null,                      'baptized',    null,                 'GH-0021', 'active',   true, 'app',   true, true, '2024-08-18'),
    (v_peter_id,  v_church_id, 'Peter Stone',     'peter@graceharbor.church',   null,       '22 Harbor Road, Brighton, MI',    'member_volunteer',  null,                      'visitor',     null,                 'GH-0022', 'pending',  true, 'email', true, true, '2026-05-03')
  on conflict (id) do update set
    full_name     = excluded.full_name,
    phone         = excluded.phone,
    address       = excluded.address,
    display_title = excluded.display_title,
    role          = excluded.role,
    membership_status = excluded.membership_status,
    family_id     = excluded.family_id,
    member_number = excluded.member_number,
    account_status = excluded.account_status,
    is_roster_eligible = excluded.is_roster_eligible,
    preferred_contact_method = excluded.preferred_contact_method,
    directory_visible = excluded.directory_visible,
    contact_allowed = excluded.contact_allowed;

  insert into public.profile_sensitive_fields
    (profile_id, church_id, emergency_contact_name, emergency_contact_phone)
  values
    (v_sarah_id,  v_church_id, 'Aaron Mitchell',   '555-2101'),
    (v_david_id,  v_church_id, 'Mei Chen',         '555-2102'),
    (v_james_id,  v_church_id, 'Lucia Ortega',     '555-2103'),
    (v_robert_id, v_church_id, 'Denise James',     '555-2105'),
    (v_linda_id,  v_church_id, 'Paul Nguyen',      '555-2107'),
    (v_elena_id,  v_church_id, 'Carlos Martinez',  '555-1110'),
    (v_carlos_id, v_church_id, 'Elena Martinez',   '555-1109'),
    (v_olivia_id, v_church_id, 'Ethan Reed',       '555-1114'),
    (v_priya_id,  v_church_id, 'Ben Patel',        '555-1118'),
    (v_ben_id,    v_church_id, 'Priya Patel',      '555-1117'),
    (v_nadia_id,  v_church_id, 'Amir Hassan',      '555-2121')
  on conflict (profile_id) do update set
    emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_phone = excluded.emergency_contact_phone;

  -- Re-read stable IDs for the main accounts after update
  select id into v_sarah_id from public.profiles where email = 'sarah@churchcoreops.app' limit 1;
  select id into v_david_id from public.profiles where email = 'david@graceharbor.church' limit 1;

  -- ── Platform admin (sarah — control-plane access) ────────
  -- platform_admins.user_id references auth.users.id (fixed in migration 20260422)
  insert into public.platform_admins (user_id)
  values (v_sarah_auth_id)
  on conflict (user_id) do nothing;

  -- ── Church memberships ──────────────────────────────────
  -- church_memberships.user_id references auth.users.id (fixed in migration 20260423)
  insert into public.church_memberships (user_id, church_id, role, is_active)
  values (v_sarah_auth_id, v_church_id, 'church_admin', true)
  on conflict (church_id, user_id, role) do update set is_active = excluded.is_active;

  insert into public.church_memberships (user_id, church_id, role, is_active)
  values (v_david_auth_id, v_church_id, 'member', true)
  on conflict (church_id, user_id, role) do update set is_active = excluded.is_active;

  -- ── Legacy tenant registry compatibility ────────────────
  -- ADR 0002 moved tenant registry tables to the control-plane database.
  -- Keep this guarded so older local branches can still seed while current
  -- tenant-runtime databases do not require public.tenants here.
  if to_regclass('public.tenants') is not null and to_regclass('public.tenant_connections') is not null then
    v_tenant_id := '33333333-0000-0000-0000-000000000001';

    insert into public.tenants (id, external_tenant_id, name, slug, timezone, tenant_status, billing_status)
    values (v_tenant_id, v_church_id, 'Grace Harbor Church', 'grace-harbor', 'America/New_York', 'active', 'trialing')
    on conflict (id) do nothing;

    insert into public.tenant_connections (tenant_id, backend_kind, connection_status, db_url, metadata)
    values (
      v_tenant_id,
      'supabase',
      'ready',
      'local-dev://resolved-from-env',
      jsonb_build_object(
        'bootstrap_source',    'seed',
        'external_tenant_id',  v_church_id,
        'runtime_church_id',   v_church_id,
        'runtime_slug',        'grace-harbor',
        'supabase_url',        'http://127.0.0.1:54321',
        'publishable_key',     '<resolved-via-env>'
      )
    )
    on conflict (tenant_id) do nothing;
  end if;

  -- ── Ministries ───────────────────────────────────────────
  insert into public.ministries (id, church_id, name, slug, ministry_type, vision_statement, health_score)
  values
    (v_worship_id,    v_church_id, 'Worship Team',        'worship-team',       'worship',     'Lead the congregation into an authentic encounter with God through music and song.',    8.4),
    (v_men_id,        v_church_id, 'Men''s Ministry',     'mens-ministry',      'men',         'Raise up men of integrity who lead their families, church, and community well.',       7.1),
    (v_women_id,      v_church_id, 'Women''s Ministry',   'womens-ministry',    'women',       'Connect women across every season of life through biblical community and mutual support.', 8.9),
    (v_marriage_id,   v_church_id, 'Marriage Ministry',   'marriage-ministry',  'marriage',    'Strengthen marriages by connecting couples with mentors and enrichment cohorts.',      7.6),
    (v_missions_id,   v_church_id, 'Global Missions',     'global-missions',    'missions',    'Extend the love of Christ to every nation through partnership, prayer, and presence.', 8.2),
    (v_outreach_id,   v_church_id, 'Community Outreach',  'community-outreach', 'outreach',    'Serving our city with the hands and feet of Jesus.',                                   7.8),
    (v_children_id,   v_church_id, 'Children''s Church',  'childrens-church',   'children',    'Creating safe, joy-filled spaces where every child discovers their worth in Christ.',  8.5),
    (v_youth_id,      v_church_id, 'Youth Ministry',      'youth-ministry',     'youth',       'Equipping the next generation to own their faith before they leave our doors.',        7.3),
    (v_youngadult_id, v_church_id, 'Young Adults',        'young-adults',       'young_adult', 'Connecting career and calling — guiding young adults to integrate faith and work.',    7.9),
    (v_education_id,  v_church_id, 'Discipleship Classes','discipleship-classes','education',  'Building theologically grounded disciples through structured biblical education.',      8.1)
  on conflict (id) do nothing;

  -- ── Ministry members ─────────────────────────────────────
  insert into public.profile_ministries (profile_id, ministry_id, church_id, role)
  values
    -- Worship Team
    (v_sarah_id,  v_worship_id,  v_church_id, 'leader'),
    (v_james_id,  v_worship_id,  v_church_id, 'assistant_leader'),
    (v_aisha_id,  v_worship_id,  v_church_id, 'member'),
    (v_david_id,  v_worship_id,  v_church_id, 'member'),
    -- Men's Ministry
    (v_robert_id, v_men_id,      v_church_id, 'leader'),
    (v_marcus_id, v_men_id,      v_church_id, 'assistant_leader'),
    (v_david_id,  v_men_id,      v_church_id, 'member'),
    -- Women's Ministry
    (v_linda_id,  v_women_id,    v_church_id, 'leader'),
    (v_grace_id,  v_women_id,    v_church_id, 'assistant_leader'),
    (v_sarah_id,  v_women_id,    v_church_id, 'member'),
    (v_aisha_id,  v_women_id,    v_church_id, 'member'),
    -- Marriage Ministry
    (v_robert_id, v_marriage_id, v_church_id, 'leader'),
    (v_linda_id,  v_marriage_id, v_church_id, 'assistant_leader'),
    -- Missions
    (v_james_id,  v_missions_id, v_church_id, 'leader'),
    (v_aisha_id,  v_missions_id, v_church_id, 'member'),
    (v_grace_id,  v_missions_id, v_church_id, 'member'),
    -- Outreach / Children / Youth / Young Adults / Education
    (v_elena_id,  v_outreach_id, v_church_id, 'leader'),
    (v_carlos_id, v_outreach_id, v_church_id, 'member'),
    (v_priya_id,  v_outreach_id, v_church_id, 'assistant_leader'),
    (v_olivia_id, v_children_id, v_church_id, 'leader'),
    (v_ethan_id,  v_children_id, v_church_id, 'member'),
    (v_sarah_id,  v_children_id, v_church_id, 'member'),
    (v_noah_id,   v_youth_id, v_church_id, 'member'),
    (v_chloe_id,  v_youth_id, v_church_id, 'member'),
    (v_ben_id,    v_youth_id, v_church_id, 'assistant_leader'),
    (v_marcus_id, v_youngadult_id, v_church_id, 'leader'),
    (v_nadia_id,  v_youngadult_id, v_church_id, 'member'),
    (v_peter_id,  v_youngadult_id, v_church_id, 'member'),
    (v_samuel_id, v_education_id, v_church_id, 'leader'),
    (v_robert_id, v_education_id, v_church_id, 'member'),
    (v_thomas_id, v_education_id, v_church_id, 'member')
  on conflict (profile_id, ministry_id) do nothing;

  -- ── Health history ───────────────────────────────────────
  insert into public.ministry_health_history (ministry_id, church_id, health_score, assessment_date, notes)
  values
    (v_worship_id,  v_church_id, 8.4, '2026-04-01', 'Strong momentum — new song library added, Easter set well-rehearsed.'),
    (v_worship_id,  v_church_id, 7.6, '2026-01-01', 'Post-holiday dip in attendance. Recovered well by February.'),
    (v_worship_id,  v_church_id, 8.1, '2025-10-01', 'New co-leader onboarded; team energy improving.'),
    (v_men_id,      v_church_id, 7.1, '2026-04-01', 'Discipleship groups growing. Need one more group leader.'),
    (v_men_id,      v_church_id, 6.5, '2026-01-01', 'Slower start to the year; attendance picking up.'),
    (v_women_id,    v_church_id, 8.9, '2026-04-01', 'Life-stage circles fully launched. Support pairings thriving.'),
    (v_women_id,    v_church_id, 8.2, '2026-01-01', 'Great momentum from fall cohort carrying over.'),
    (v_marriage_id, v_church_id, 7.6, '2026-04-01', 'Three mentor couples now active. New cohort starting in May.'),
    (v_missions_id, v_church_id, 8.2, '2026-04-01', 'Guatemala trip completed. Honduras planning underway.')
  on conflict do nothing;

  -- ── Kingdom impacts ──────────────────────────────────────
  insert into public.kingdom_impacts (ministry_id, church_id, impact_type, description, occurred_at, created_by)
  values
    (v_worship_id,  v_church_id, 'salvation',             'Two people made first-time commitments during Easter Sunday worship.',                 '2026-04-06', v_sarah_id),
    (v_worship_id,  v_church_id, 'prayer_answered',       'Team completed 80 hours of prayer-covered worship preparation for Good Friday.',       '2026-03-29', v_james_id),
    (v_men_id,      v_church_id, 'disciple_made',         'Iron Sharpens Iron cohort completed 8-week study on Proverbs.',                        '2026-03-20', v_robert_id),
    (v_men_id,      v_church_id, 'restored_relationship', 'Two estranged brothers reconciled through men''s group ministry.',                     '2026-03-08', v_marcus_id),
    (v_women_id,    v_church_id, 'disciple_made',         'New Mom circle completed first 6-week session with 9 participants.',                   '2026-04-01', v_linda_id),
    (v_women_id,    v_church_id, 'prayer_answered',       'Grace season circle saw healing answered for a member after sustained prayer.',        '2026-03-15', v_grace_id),
    (v_marriage_id, v_church_id, 'restored_relationship', 'Newlywed cohort retreat helped one couple step back from separation process.',         '2026-03-22', v_robert_id),
    (v_missions_id, v_church_id, 'prayer_answered',       'Guatemala trip: water filtration installed in two villages after years of prayer.',    '2026-02-28', v_james_id),
    (v_missions_id, v_church_id, 'salvation',             'Three salvations reported through partner org Esperanza Internacional.',               '2026-03-10', v_aisha_id)
  on conflict do nothing;

  -- ── Worship track data ───────────────────────────────────
  insert into public.worship_songs (id, ministry_id, church_id, title, artist, song_key, tempo, tags, last_used_at)
  values
    (gen_random_uuid(), v_worship_id, v_church_id, 'Great Is Thy Faithfulness',   'Traditional',   'G',  'Moderate', array['hymn','sunday'],               '2026-04-06'),
    (gen_random_uuid(), v_worship_id, v_church_id, 'Build My Life',               'Housefires',    'D',  'Medium',   array['contemporary','opening'],       '2026-04-06'),
    (gen_random_uuid(), v_worship_id, v_church_id, 'Way Maker',                   'Sinach',        'A',  'Moderate', array['worship','contemporary'],       '2026-03-30'),
    (gen_random_uuid(), v_worship_id, v_church_id, 'Goodness of God',             'Bethel Music',  'B',  'Slow',     array['contemporary','closing'],       '2026-03-23'),
    (gen_random_uuid(), v_worship_id, v_church_id, 'How Great Thou Art',          'Traditional',   'Bb', 'Moderate', array['hymn','easter'],                '2026-04-06'),
    (gen_random_uuid(), v_worship_id, v_church_id, 'Cornerstone',                 'Hillsong',      'E',  'Medium',   array['contemporary'],                 '2026-03-16'),
    (gen_random_uuid(), v_worship_id, v_church_id, '10,000 Reasons',              'Matt Redman',   'G',  'Medium',   array['contemporary','opener'],        '2026-02-23')
  on conflict do nothing;

  insert into public.worship_rehearsals (id, ministry_id, church_id, scheduled_at, notes, rsvp_count, song_ids)
  values
    (gen_random_uuid(), v_worship_id, v_church_id, '2026-04-19 10:00:00+00', 'Run through Easter follow-up set — confirm transitions.', 8, array[]::uuid[]),
    (gen_random_uuid(), v_worship_id, v_church_id, '2026-04-26 10:00:00+00', 'First run of May series: "Rooted". New charts distributed.', 7, array[]::uuid[])
  on conflict do nothing;

  -- ── Men's track data ─────────────────────────────────────
  insert into public.mentorship_pairs (id, ministry_id, church_id, mentor_id, mentee_id, status, started_at, notes)
  values
    (gen_random_uuid(), v_men_id, v_church_id, v_robert_id, v_david_id, 'active', '2026-01-15', 'Meeting bi-weekly at the church café. Studying leadership in Nehemiah.'),
    (gen_random_uuid(), v_men_id, v_church_id, v_marcus_id, v_james_id,  'active', '2026-02-01', 'Focused on family leadership and spiritual disciplines.')
  on conflict do nothing;

  insert into public.discipleship_groups (id, ministry_id, church_id, name, leader_id, cadence, is_open, member_ids)
  values
    (gen_random_uuid(), v_men_id, v_church_id, 'Iron Sharpens Iron',       v_robert_id, 'Tuesdays 7pm',    false, array[v_robert_id, v_marcus_id, v_david_id]),
    (gen_random_uuid(), v_men_id, v_church_id, 'Young Men''s Discipleship', v_marcus_id, 'Thursdays 6:30pm', true,  array[v_marcus_id, v_james_id])
  on conflict do nothing;

  -- ── Women's track data ───────────────────────────────────
  -- life_stage_circles uses member_ids uuid[] (no member_count column)
  insert into public.life_stage_circles (id, ministry_id, church_id, name, life_stage, leader_id, meeting_cadence, member_ids)
  values
    (gen_random_uuid(), v_women_id, v_church_id, 'New Moms Circle',     'new_mom',     v_linda_id, 'Wednesdays 10am', array[v_linda_id, v_aisha_id]),
    (gen_random_uuid(), v_women_id, v_church_id, 'Single Women Rising', 'single_woman', v_grace_id, 'Fridays 7pm',    array[v_grace_id]),
    (gen_random_uuid(), v_women_id, v_church_id, 'Grace Season Circle', 'empty_nester', v_linda_id, 'Mondays 6:30pm', array[v_linda_id, v_sarah_id])
  on conflict do nothing;

  insert into public.support_pairings (id, ministry_id, church_id, supporter_id, supported_id, pairing_reason, status)
  values
    (gen_random_uuid(), v_women_id, v_church_id, v_linda_id, v_aisha_id, 'Life season alignment — both navigating early motherhood and ministry.', 'active'),
    (gen_random_uuid(), v_women_id, v_church_id, v_grace_id, v_sarah_id, 'Leadership mentoring — Grace supporting Sarah through ministry growth.', 'active')
  on conflict do nothing;

  -- ── Marriage track data ──────────────────────────────────
  -- mentor_couples: partner1_id, partner2_id (UUIDs), couple_name, years_married, cohort_focus
  -- No partner1_name/partner2_name columns in the table
  insert into public.mentor_couples (id, ministry_id, church_id, partner1_id, partner2_id, couple_name, years_married, cohort_focus, is_available)
  values
    (gen_random_uuid(), v_marriage_id, v_church_id, v_robert_id, null, 'The James Family',    22, '5_15_years', true),
    (gen_random_uuid(), v_marriage_id, v_church_id, v_marcus_id, null, 'The Williams Family', 15, 'newlywed',   false)
  on conflict do nothing;

  -- marriage_cohorts: couple_ids uuid[] (not couple_count)
  insert into public.marriage_cohorts (id, ministry_id, church_id, name, cohort_stage, mentor_couple_id, couple_ids)
  select gen_random_uuid(), v_marriage_id, v_church_id, 'Newlywed Journey (Spring 2026)', 'newlywed', mc.id, array[]::uuid[]
  from public.mentor_couples mc where mc.ministry_id = v_marriage_id and mc.couple_name = 'The Williams Family' limit 1
  on conflict do nothing;

  insert into public.marriage_cohorts (id, ministry_id, church_id, name, cohort_stage, mentor_couple_id, couple_ids)
  select gen_random_uuid(), v_marriage_id, v_church_id, 'Mid-Marriage Enrichment', '5_15_years', mc.id, array[]::uuid[]
  from public.mentor_couples mc where mc.ministry_id = v_marriage_id and mc.couple_name = 'The James Family' limit 1
  on conflict do nothing;

  -- ── Missions track data ──────────────────────────────────
  insert into public.mission_partners (id, ministry_id, church_id, name, region, focus_area, contact_name, relationship_status)
  values
    (gen_random_uuid(), v_missions_id, v_church_id, 'Esperanza Internacional', 'Guatemala City, Guatemala', 'Medical outreach and VBS',         'Maria Gonzalez',       'active'),
    (gen_random_uuid(), v_missions_id, v_church_id, 'Hands of Hope Honduras',  'Tegucigalpa, Honduras',     'Clean water and church planting',  'Pastor José Rivera',   'active'),
    (gen_random_uuid(), v_missions_id, v_church_id, 'Urban Lighthouse NYC',    'New York City, USA',        'Urban youth ministry',             'Pastor Darnell Brown', 'prospective')
  on conflict do nothing;

  -- mission_trips: departs_at/returns_at are date (not timestamptz); participant_ids uuid[] (not participant_count)
  insert into public.mission_trips (id, ministry_id, church_id, name, destination, departs_at, returns_at, participant_ids, hours_served, people_reached, status, partner_id, impact_notes)
  select
    gen_random_uuid(), v_missions_id, v_church_id,
    'Guatemala Medical Outreach 2026', 'Guatemala City, Guatemala',
    '2026-02-18'::date, '2026-02-27'::date,
    array[v_james_id, v_aisha_id, v_grace_id],
    480, 320, 'completed', mp.id,
    'Served 320 people with free medical screenings, VBS for 85 children, and water filtration installation in two villages.'
  from public.mission_partners mp
  where mp.ministry_id = v_missions_id and mp.name = 'Esperanza Internacional'
  limit 1
  on conflict do nothing;

  insert into public.mission_trips (id, ministry_id, church_id, name, destination, departs_at, returns_at, participant_ids, hours_served, people_reached, status, partner_id, impact_notes)
  select
    gen_random_uuid(), v_missions_id, v_church_id,
    'Honduras Clean Water Project 2026', 'Tegucigalpa, Honduras',
    '2026-07-10'::date, '2026-07-19'::date,
    array[]::uuid[],
    0, 0, 'confirmed', mp.id, null
  from public.mission_partners mp
  where mp.ministry_id = v_missions_id and mp.name = 'Hands of Hope Honduras'
  limit 1
  on conflict do nothing;

  -- ── Children's track data ────────────────────────────────
  insert into public.children_rooms (id, ministry_id, church_id, name, age_min, age_max, capacity, target_ratio, is_active)
  values
    (gen_random_uuid(), v_children_id, v_church_id, 'Nursery (0–2)',      0,  2,  12, 4.0, true),
    (gen_random_uuid(), v_children_id, v_church_id, 'Toddler (3–4)',      3,  4,  15, 5.0, true),
    (gen_random_uuid(), v_children_id, v_church_id, 'Pre-K / Kinder',     5,  6,  20, 6.0, true),
    (gen_random_uuid(), v_children_id, v_church_id, 'Elementary (7–10)', 7,  10, 24, 8.0, true),
    (gen_random_uuid(), v_children_id, v_church_id, 'Pre-Teen (11–12)',  11, 12, 20, 7.0, true)
  on conflict do nothing;

  -- Sample check-ins for last Sunday
  insert into public.children_checkins (room_id, church_id, child_name, guardian_name, leader_count, service_date)
  select cr.id, v_church_id, 'Emma Rodriguez',   'Maria Rodriguez',  3, (current_date - interval '0 days')::date
  from public.children_rooms cr where cr.ministry_id = v_children_id and cr.name = 'Nursery (0–2)' limit 1
  on conflict do nothing;

  insert into public.children_checkins (room_id, church_id, child_name, guardian_name, leader_count, service_date)
  select cr.id, v_church_id, 'Noah Williams',    'Pastor Williams',  3, (current_date - interval '0 days')::date
  from public.children_rooms cr where cr.ministry_id = v_children_id and cr.name = 'Nursery (0–2)' limit 1
  on conflict do nothing;

  insert into public.children_checkins (room_id, church_id, child_name, guardian_name, leader_count, service_date)
  select cr.id, v_church_id, 'Lily Chen',        'David Chen',       2, (current_date - interval '0 days')::date
  from public.children_rooms cr where cr.ministry_id = v_children_id and cr.name = 'Elementary (7–10)' limit 1
  on conflict do nothing;

  -- ── Youth track data ─────────────────────────────────────
  insert into public.youth_milestones (id, ministry_id, church_id, name, description, milestone_order, is_required)
  values
    (v_ms_baptism_id,    v_youth_id, v_church_id, 'Baptism',              'Public declaration of faith through believer''s baptism.',          1, true),
    (v_ms_firstserve_id, v_youth_id, v_church_id, 'First Serve',          'Participate in a church-wide service day or volunteer event.',       2, true),
    (v_ms_faithclass_id, v_youth_id, v_church_id, 'Faith Foundations Class', 'Complete the 6-week core doctrine class for students.',          3, true),
    (v_ms_leadership_id, v_youth_id, v_church_id, 'Student Leader Role',  'Serve as a small group leader or student ministry volunteer.',       4, false)
  on conflict (id) do nothing;

  -- Sample graduation tracking for Lily Chen (David's daughter)
  insert into public.youth_graduation_tracking (ministry_id, church_id, profile_id, milestone_id, graduation_year, completed_at)
  values
    (v_youth_id, v_church_id, v_david_id, v_ms_baptism_id,    2027, '2025-04-15'),
    (v_youth_id, v_church_id, v_david_id, v_ms_firstserve_id, 2027, '2025-11-20')
  on conflict (church_id, profile_id, milestone_id) do nothing;

  -- ── Young Adults track data ───────────────────────────────
  insert into public.young_adult_career_mentorships (ministry_id, church_id, mentor_id, mentee_id, industry, focus_area, status, started_at)
  values
    (v_youngadult_id, v_church_id, v_robert_id, v_marcus_id, 'Finance',     'Workplace Ethics & Integrity',    'active',    '2026-01-15'),
    (v_youngadult_id, v_church_id, v_james_id,  v_aisha_id,  'Technology',  'Calling Discovery in Tech',       'active',    '2026-02-01'),
    (v_youngadult_id, v_church_id, v_grace_id,  v_david_id,  'Education',   'Kingdom Purpose in the Classroom','active',    '2026-03-10'),
    (v_youngadult_id, v_church_id, v_linda_id,  v_sarah_id,  'Healthcare',  'Seeking',                         'seeking',   null)
  on conflict do nothing;

  -- ── Education track data ──────────────────────────────────
  insert into public.education_courses (ministry_id, church_id, title, curriculum_area, description, duration_weeks, is_active, course_order)
  values
    (v_education_id, v_church_id, 'Christianity 101',          'theology',             'Core beliefs: God, Scripture, salvation, and the Church.',    6,  true, 1),
    (v_education_id, v_church_id, 'Old Testament Survey',      'bible_survey',         'Walking through the Hebrew Scriptures from Genesis to Malachi.', 8, true, 2),
    (v_education_id, v_church_id, 'New Testament Survey',      'bible_survey',         'Jesus, the letters, and the story of the early Church.',       8,  true, 3),
    (v_education_id, v_church_id, 'Spiritual Disciplines',     'spiritual_disciplines','Prayer, fasting, solitude, and Scripture memorization.',       6,  true, 4),
    (v_education_id, v_church_id, 'Apologetics Basics',        'apologetics',          'Reasons for faith: evidence, logic, and common objections.',   5,  true, 5),
    (v_education_id, v_church_id, 'Church History',            'church_history',       'From Pentecost to the Reformation and beyond.',                7,  true, 6),
    (v_education_id, v_church_id, 'Biblical Financial Stewardship', 'finance',         'Money, generosity, and Kingdom economics.',                    4,  true, 7)
  on conflict do nothing;

  -- Enroll some members with completions
  insert into public.education_enrollments (church_id, course_id, profile_id, enrolled_at, completed_at)
  select v_church_id, ec.id, v_sarah_id, '2025-09-01', '2025-10-15'
  from public.education_courses ec
  where ec.ministry_id = v_education_id and ec.title = 'Christianity 101'
  on conflict (church_id, course_id, profile_id) do nothing;

  insert into public.education_enrollments (church_id, course_id, profile_id, enrolled_at, completed_at)
  select v_church_id, ec.id, v_sarah_id, '2025-10-15', '2025-12-01'
  from public.education_courses ec
  where ec.ministry_id = v_education_id and ec.title = 'Old Testament Survey'
  on conflict (church_id, course_id, profile_id) do nothing;

  insert into public.education_enrollments (church_id, course_id, profile_id, enrolled_at, completed_at)
  select v_church_id, ec.id, v_sarah_id, '2026-01-10', null
  from public.education_courses ec
  where ec.ministry_id = v_education_id and ec.title = 'Spiritual Disciplines'
  on conflict (church_id, course_id, profile_id) do nothing;

  insert into public.education_enrollments (church_id, course_id, profile_id, enrolled_at, completed_at)
  select v_church_id, ec.id, v_robert_id, '2025-09-01', '2025-10-20'
  from public.education_courses ec
  where ec.ministry_id = v_education_id and ec.title = 'Christianity 101'
  on conflict (church_id, course_id, profile_id) do nothing;

  insert into public.education_enrollments (church_id, course_id, profile_id, enrolled_at, completed_at)
  select v_church_id, ec.id, v_robert_id, '2025-11-01', '2026-01-05'
  from public.education_courses ec
  where ec.ministry_id = v_education_id and ec.title = 'Church History'
  on conflict (church_id, course_id, profile_id) do nothing;

  insert into public.education_enrollments (church_id, course_id, profile_id, enrolled_at, completed_at)
  select v_church_id, ec.id, v_marcus_id, '2026-02-01', '2026-03-15'
  from public.education_courses ec
  where ec.ministry_id = v_education_id and ec.title = 'Biblical Financial Stewardship'
  on conflict (church_id, course_id, profile_id) do nothing;

  -- ── Outreach track data ───────────────────────────────────
  insert into public.outreach_zones (ministry_id, church_id, zone_name, description, total_events, total_volunteers, total_served, last_event_date, coverage_level)
  values
    (v_outreach_id, v_church_id, 'Riverside District',   'Low-income housing corridor along the river.',                     3, 45, 280, '2026-03-15', 'medium'),
    (v_outreach_id, v_church_id, 'Downtown Core',        'Business district — homeless outreach and meal ministry.',         5, 80, 410, '2026-04-06', 'high'),
    (v_outreach_id, v_church_id, 'East Side Families',   'Family neighborhood with high immigrant population.',              1, 12,  65, '2026-02-08', 'low'),
    (v_outreach_id, v_church_id, 'Northgate Schools',    'Elementary and middle school area — after-school programs.',       2, 30, 150, '2026-03-28', 'medium'),
    (v_outreach_id, v_church_id, 'South Harbor Seniors', 'Retirement communities and assisted living facilities.',           0,  0,   0, null,         'low')
  on conflict (church_id, zone_name) do nothing;

  insert into public.outreach_events (ministry_id, church_id, name, event_date, location, zone_name, volunteer_count, people_served, status, notes)
  values
    (v_outreach_id, v_church_id, 'Easter Food Drive',         '2026-04-06', '123 Main St',        'Downtown Core',       18, 95,  'completed', 'Distributed 95 food boxes to local families.'),
    (v_outreach_id, v_church_id, 'Riverside Clean-Up Day',    '2026-03-15', 'Riverside Park',      'Riverside District',  12, 0,   'completed', '3 tons of litter collected along the river corridor.'),
    (v_outreach_id, v_church_id, 'Northgate After-School',    '2026-03-28', 'Lincoln Elementary',  'Northgate Schools',   8,  60,  'completed', 'Tutoring and snacks for 60 students.'),
    (v_outreach_id, v_church_id, 'Immigrant Welcome Fair',    '2026-02-08', 'East Community Center','East Side Families', 12, 65,  'completed', 'Translation services, ESL resources, and hot meals.'),
    (v_outreach_id, v_church_id, 'Summer Block Party',        '2026-07-19', 'Downtown Plaza',      'Downtown Core',       25, 0,   'planned',   'Annual summer outreach with food, games, and prayer stations.')
  on conflict do nothing;

  -- ── Admin dashboard / operations demo data ───────────────
  insert into public.events
    (id, church_id, ministry_id, created_by, title, description, location, starts_at, ends_at, category, visibility, rsvp_enabled, capacity, approval_status)
  values
    (v_sunday_event_id,   v_church_id, v_worship_id,    v_sarah_id, 'Sunday Worship Gathering', 'Main weekly worship service with children''s ministry and hospitality teams.', 'Sanctuary', timezone('utc', now()) + interval '3 days', timezone('utc', now()) + interval '3 days 1 hour 30 minutes', 'worship', 'public', true, 220, 'approved'),
    (v_youth_event_id,    v_church_id, v_youth_id,      v_ben_id,   'Youth Worship Night',      'Student worship, small groups, and parent pickup coordination.',              'Youth Room', timezone('utc', now()) + interval '5 days', timezone('utc', now()) + interval '5 days 2 hours', 'ministry', 'members', true, 80, 'pending'),
    (v_outreach_event_id, v_church_id, v_outreach_id,   v_elena_id, 'Neighborhood Food Pantry', 'Monthly pantry distribution with prayer team follow-up.',                       'Community Hall', timezone('utc', now()) + interval '8 days', timezone('utc', now()) + interval '8 days 3 hours', 'outreach', 'public', true, 120, 'approved'),
    (v_class_event_id,    v_church_id, v_education_id,  v_samuel_id,'Christianity 101',         'Six-week foundations class for new members and seekers.',                       'Room 204', timezone('utc', now()) + interval '10 days', timezone('utc', now()) + interval '10 days 1 hour 15 minutes', 'informational', 'members', true, 24, 'draft'),
    (v_marriage_event_id, v_church_id, v_marriage_id,   v_robert_id,'Marriage Enrichment Night','Mentor couples and table discussion for married couples.',                       'Fellowship Hall', timezone('utc', now()) + interval '16 days', timezone('utc', now()) + interval '16 days 2 hours', 'ministry', 'members', true, 60, 'approved')
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    location = excluded.location,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    category = excluded.category,
    visibility = excluded.visibility,
    rsvp_enabled = excluded.rsvp_enabled,
    capacity = excluded.capacity,
    approval_status = excluded.approval_status;

  insert into public.event_registration_settings
    (event_id, church_id, registration_open, capacity, price_cents, deadline, confirmation_message, waitlist_enabled)
  values
    (v_sunday_event_id,   v_church_id, true, 220, 0, timezone('utc', now()) + interval '2 days', 'We look forward to worshiping with you.', true),
    (v_youth_event_id,    v_church_id, true, 80,  0, timezone('utc', now()) + interval '4 days', 'Bring a friend and arrive by 6:30 PM.', true),
    (v_outreach_event_id, v_church_id, true, 120, 0, timezone('utc', now()) + interval '7 days', 'Volunteer details will be emailed before the event.', true),
    (v_class_event_id,    v_church_id, true, 24,  0, timezone('utc', now()) + interval '9 days', 'Class materials will be provided.', true),
    (v_marriage_event_id, v_church_id, true, 60,  0, timezone('utc', now()) + interval '15 days', 'Dessert and childcare are provided.', true)
  on conflict (event_id) do update set
    registration_open = excluded.registration_open,
    capacity = excluded.capacity,
    deadline = excluded.deadline,
    confirmation_message = excluded.confirmation_message,
    waitlist_enabled = excluded.waitlist_enabled;

  insert into public.event_rosters (church_id, event_id, profile_id, role_title, is_confirmed)
  values
    (v_church_id, v_sunday_event_id,   v_sarah_id,  'Service Coordinator', true),
    (v_church_id, v_sunday_event_id,   v_james_id,  'Worship Lead', true),
    (v_church_id, v_sunday_event_id,   v_olivia_id, 'Children''s Lead', false),
    (v_church_id, v_youth_event_id,    v_ben_id,    'Youth Lead', false),
    (v_church_id, v_outreach_event_id, v_elena_id,  'Hospitality Lead', true),
    (v_church_id, v_outreach_event_id, v_priya_id,  'Prayer Team', true),
    (v_church_id, v_marriage_event_id, v_robert_id, 'Mentor Couple Host', true)
  on conflict (event_id, profile_id, role_title) do nothing;

  insert into public.event_registrations
    (event_id, church_id, profile_id, registrant_name, registrant_email, registrant_phone, status, is_waitlisted, notes)
  values
    (v_sunday_event_id, v_church_id, v_david_id,  'David Chen',      'david@graceharbor.church',  '555-1102', 'confirmed', false, null),
    (v_sunday_event_id, v_church_id, v_linda_id,  'Linda Nguyen',    'linda@graceharbor.church',  '555-1107', 'confirmed', false, null),
    (v_sunday_event_id, v_church_id, v_noah_id,   'Noah Brooks',     'noah@graceharbor.church',   '555-1112', 'confirmed', false, 'First-time Sunday guest.'),
    (v_youth_event_id,  v_church_id, v_chloe_id,  'Chloe Brooks',    'chloe@graceharbor.church',  null,       'confirmed', true,  'Waitlisted until another small-group leader is confirmed.'),
    (v_class_event_id,  v_church_id, v_peter_id,  'Peter Stone',     'peter@graceharbor.church',  null,       'confirmed', false, 'Interested in membership.'),
    (v_marriage_event_id, v_church_id, v_carlos_id, 'Carlos Martinez','carlos@graceharbor.church','555-1110', 'confirmed', false, null),
    (v_marriage_event_id, v_church_id, v_elena_id,  'Elena Martinez', 'elena@graceharbor.church', '555-1109', 'confirmed', false, null)
  on conflict do nothing;

  insert into public.account_requests
    (church_id, profile_id, email, phone, first_name, last_name, is_existing_member, status)
  values
    (v_church_id, v_maya_id,  'maya@graceharbor.church',  null,       'Maya',  'Martinez', true,  'pending'),
    (v_church_id, v_noah_id,  'noah@graceharbor.church',  '555-1112', 'Noah',  'Brooks',   true,  'pending'),
    (v_church_id, v_peter_id, 'peter@graceharbor.church', null,       'Peter', 'Stone',    true,  'pending'),
    (v_church_id, null,       'talia.visitor@example.com','555-1301', 'Talia', 'Grant',    false, 'pending')
  on conflict do nothing;

  insert into public.care_assignments
    (church_id, profile_id, created_by, assigned_to, summary, status, priority, due_at, last_contact_at)
  values
    (v_church_id, v_elena_id, v_sarah_id, null,       'Hospital follow-up and meal train coordination after surgery.', 'open',        'urgent', timezone('utc', now()) - interval '1 day', null),
    (v_church_id, v_noah_id,  v_sarah_id, v_sarah_id, 'First-time visitor follow-up after Sunday registration.',       'open',        'high',   timezone('utc', now()) + interval '1 day', null),
    (v_church_id, v_rachel_id,v_sarah_id, v_linda_id, 'Reconnect inactive member and confirm current contact preference.', 'in_progress', 'high', timezone('utc', now()) + interval '2 days', timezone('utc', now()) - interval '3 days'),
    (v_church_id, v_peter_id, v_sarah_id, v_samuel_id,'Membership class follow-up and next-step conversation.',        'open',        'routine',timezone('utc', now()) + interval '5 days', null)
  on conflict do nothing;

  insert into public.notification_preferences
    (church_id, profile_id, email_opt_in, sms_opt_in, push_opt_in)
  values
    (v_church_id, v_sarah_id, true,  true,  true),
    (v_church_id, v_david_id, true,  true,  false),
    (v_church_id, v_rachel_id,false, false, false),
    (v_church_id, v_chloe_id, true,  false, false),
    (v_church_id, v_peter_id, true,  false, false)
  on conflict (church_id, profile_id) do update set
    email_opt_in = excluded.email_opt_in,
    sms_opt_in = excluded.sms_opt_in,
    push_opt_in = excluded.push_opt_in;

  insert into public.communication_logs
    (church_id, sent_by, recipient_id, channel, subject, body_preview, status, scheduled_for, sent_at, error_message)
  values
    (v_church_id, v_sarah_id, null,       'email', 'Weekend serving brief', 'Final details for Sunday teams.', 'queued', timezone('utc', now()) + interval '6 hours', null, null),
    (v_church_id, v_sarah_id, v_noah_id,  'email', 'Thanks for visiting Grace Harbor', 'We were grateful to meet you Sunday.', 'sent', null, timezone('utc', now()) - interval '1 day', null),
    (v_church_id, v_linda_id, v_rachel_id,'sms',   'Checking in', 'We have missed seeing you and wanted to check in.', 'failed', null, null, 'Demo Twilio failure for unreachable phone.'),
    (v_church_id, v_sarah_id, null,       'email', 'Food pantry volunteers', 'Reminder for Saturday pantry setup.', 'bounced', null, null, 'Demo bounce for outdated email list.')
  on conflict do nothing;

  insert into public.finance_accounts (church_id, account_code, name, description, account_type, is_active)
  values
    (v_church_id, '1000', 'Operating Checking', 'Primary operating bank account.', 'asset', true),
    (v_church_id, '4000', 'General Contributions', 'General fund giving income.', 'income', true),
    (v_church_id, '4010', 'Missions Contributions', 'Designated missions giving.', 'income', true),
    (v_church_id, '4020', 'Building Fund Contributions', 'Designated building fund giving.', 'income', true)
  on conflict (church_id, account_code) do update set
    name = excluded.name,
    description = excluded.description,
    account_type = excluded.account_type,
    is_active = excluded.is_active;

  insert into public.giving_fund_accounts
    (church_id, fund_designation, asset_account_id, income_account_id, is_active)
  select v_church_id, 'General Fund', asset.id, income.id, true
  from public.finance_accounts asset, public.finance_accounts income
  where asset.church_id = v_church_id
    and asset.account_code = '1000'
    and income.church_id = v_church_id
    and income.account_code = '4000'
  on conflict (church_id, fund_designation) do update set
    asset_account_id = excluded.asset_account_id,
    income_account_id = excluded.income_account_id,
    is_active = excluded.is_active;

  insert into public.giving_fund_accounts
    (church_id, fund_designation, asset_account_id, income_account_id, is_active)
  select v_church_id, 'Missions', asset.id, income.id, true
  from public.finance_accounts asset, public.finance_accounts income
  where asset.church_id = v_church_id
    and asset.account_code = '1000'
    and income.church_id = v_church_id
    and income.account_code = '4010'
  on conflict (church_id, fund_designation) do update set
    asset_account_id = excluded.asset_account_id,
    income_account_id = excluded.income_account_id,
    is_active = excluded.is_active;

  insert into public.public_giving_pages
    (church_id, slug, headline, description, funds, stripe_account_id, is_live, allow_anonymous)
  values
    (v_church_id, 'grace-harbor', 'Give to Grace Harbor', 'Support ministry, missions, and community outreach through secure online giving.', '["General Fund", "Missions", "Building Fund"]'::jsonb, 'acct_demo_grace_harbor', true, true)
  on conflict (church_id) do update set
    slug = excluded.slug,
    headline = excluded.headline,
    description = excluded.description,
    funds = excluded.funds,
    stripe_account_id = excluded.stripe_account_id,
    is_live = excluded.is_live,
    allow_anonymous = excluded.allow_anonymous;

  insert into public.donations
    (church_id, profile_id, donor_name, donor_email, amount_cents, currency, fund_designation, stripe_payment_intent_id, is_recurring, status, is_anonymous, receipt_sent_at, note, created_at)
  values
    (v_church_id, v_sarah_id,  'Sarah Mitchell',  'sarah@churchcoreops.app',   15000, 'usd', 'General Fund',  'pi_demo_0001', false, 'succeeded', false, timezone('utc', now()) - interval '2 days', 'Sunday giving.', timezone('utc', now()) - interval '5 days'),
    (v_church_id, v_david_id,  'David Chen',      'david@graceharbor.church',  7500,  'usd', 'Missions',      'pi_demo_0002', true,  'succeeded', false, null, 'Recurring missions support.', timezone('utc', now()) - interval '4 days'),
    (v_church_id, v_linda_id,  'Linda Nguyen',    'linda@graceharbor.church',  5000,  'usd', 'Building Fund', 'pi_demo_0003', false, 'succeeded', false, null, 'Unmapped fund demo.', timezone('utc', now()) - interval '3 days'),
    (v_church_id, v_noah_id,   'Noah Brooks',     'noah@graceharbor.church',   2500,  'usd', 'General Fund',  'pi_demo_0004', false, 'pending',   false, null, 'Pending payment demo.', timezone('utc', now()) - interval '1 day'),
    (v_church_id, null,        'Anonymous Donor', 'anonymous@example.com',     10000, 'usd', 'General Fund',  'pi_demo_0005', false, 'succeeded', true,  timezone('utc', now()) - interval '1 day', 'Anonymous demo gift.', timezone('utc', now()) - interval '2 days'),
    (v_church_id, v_peter_id,  'Peter Stone',     'peter@graceharbor.church',  4000,  'usd', 'General Fund',  'pi_demo_0006', false, 'failed',    false, null, 'Failed payment demo.', timezone('utc', now()) - interval '12 hours')
  on conflict do nothing;

  -- ── Marriage pulse demo entries ───────────────────────────
  insert into public.marriage_pulse_entries (ministry_id, church_id, survey_week, theme, sentiment)
  values
    (v_marriage_id, v_church_id, date_trunc('week', current_date - interval '3 weeks')::date, 'communication',    4),
    (v_marriage_id, v_church_id, date_trunc('week', current_date - interval '3 weeks')::date, 'parenting',        3),
    (v_marriage_id, v_church_id, date_trunc('week', current_date - interval '3 weeks')::date, 'communication',    5),
    (v_marriage_id, v_church_id, date_trunc('week', current_date - interval '2 weeks')::date, 'finance',          3),
    (v_marriage_id, v_church_id, date_trunc('week', current_date - interval '2 weeks')::date, 'spiritual_growth', 4),
    (v_marriage_id, v_church_id, date_trunc('week', current_date - interval '1 week')::date,  'communication',    4),
    (v_marriage_id, v_church_id, date_trunc('week', current_date - interval '1 week')::date,  'conflict',         2),
    (v_marriage_id, v_church_id, date_trunc('week', current_date - interval '1 week')::date,  'intimacy',         3)
  on conflict do nothing;

  -- ── CCM demo data ─────────────────────────────────────────

  declare
    v_ccm_service_id  uuid := 'cccccccc-0000-0000-0000-000000000001';
    v_ccm_room_1      uuid;
    v_ccm_room_2      uuid;
    v_ccm_session_1   uuid := 'cccccccc-0000-0000-0000-000000000010';
    v_ccm_session_2   uuid := 'cccccccc-0000-0000-0000-000000000011';
    v_ccm_session_3   uuid := 'cccccccc-0000-0000-0000-000000000012';
    v_ccm_profile_1   uuid;
    v_ccm_profile_2   uuid;
  begin
    -- Look up or create room IDs from children_rooms (seeded by ministry setup)
    select id into v_ccm_room_1
    from public.children_rooms
    where church_id = v_church_id
    limit 1;

    select id into v_ccm_room_2
    from public.children_rooms
    where church_id = v_church_id
    offset 1 limit 1;

    -- Fallback: if no rooms exist yet, skip CCM seed
    if v_ccm_room_1 is null then
      raise notice 'CCM seed skipped — no children_rooms found. Create rooms first.';
    else

      -- Open service
      insert into public.ccm_services
        (id, church_id, ministry_id, service_name, service_date, status, started_at)
      values
        (v_ccm_service_id, v_church_id, v_children_id,
         'Sunday Children''s Church', current_date, 'open',
         timezone('utc', now()))
      on conflict (id) do nothing;

      -- Look up two child profiles
      select id into v_ccm_profile_1
      from public.profiles
      where church_id = v_church_id
      limit 1;

      select id into v_ccm_profile_2
      from public.profiles
      where church_id = v_church_id
      offset 1 limit 1;

      -- Check-in sessions (PIN hashes are bcrypt of "ABC123")
      insert into public.ccm_checkin_sessions
        (id, church_id, service_id, room_id, child_profile_id, child_name,
         guardian_name, pin_hash, current_room_id, is_first_visit, status)
      values
        (v_ccm_session_1, v_church_id, v_ccm_service_id, v_ccm_room_1, v_ccm_profile_1,
         'Emma Thompson', 'Laura Thompson',
         '$2b$12$demo.hash.value.for.dev.only.not.real.bcrypt.xxxxxxxxxx',
         v_ccm_room_1, false, 'checked_in'),
        (v_ccm_session_2, v_church_id, v_ccm_service_id, v_ccm_room_1, null,
         'Noah Martinez', 'Carlos Martinez',
         '$2b$12$demo.hash.value.for.dev.only.not.real.bcrypt.xxxxxxxxxx',
         v_ccm_room_1, true, 'checked_in'),
        (v_ccm_session_3, v_church_id, v_ccm_service_id,
         coalesce(v_ccm_room_2, v_ccm_room_1), v_ccm_profile_2,
         'Sophie Johnson', 'Rachel Johnson',
         '$2b$12$demo.hash.value.for.dev.only.not.real.bcrypt.xxxxxxxxxx',
         coalesce(v_ccm_room_2, v_ccm_room_1), false, 'checked_in')
      on conflict (id) do nothing;

      -- Authorized pickups for Emma
      insert into public.ccm_authorized_pickups
        (church_id, child_profile_id, authorized_name, relationship, is_primary, id_verified)
      values
        (v_church_id, v_ccm_profile_1, 'Laura Thompson', 'parent', true, true),
        (v_church_id, v_ccm_profile_1, 'Robert Thompson', 'parent', false, true),
        (v_church_id, v_ccm_profile_1, 'Margaret Thompson', 'grandparent', false, false)
      on conflict do nothing;

      -- Volunteer assignment for demo service
      insert into public.ccm_volunteer_assignments
        (church_id, service_id, room_id, profile_id, role, background_check_verified, checked_in_at)
      values
        (v_church_id, v_ccm_service_id, v_ccm_room_1, v_sarah_id,
         'lead_teacher', true, timezone('utc', now())),
        (v_church_id, v_ccm_service_id, v_ccm_room_1, v_david_id,
         'assistant', true, timezone('utc', now()))
      on conflict (service_id, room_id, profile_id) do nothing;

      -- Demo incident
      insert into public.ccm_incidents
        (church_id, service_id, child_name, incident_type, severity,
         description, actions_taken, guardian_notified, follow_up_required)
      values
        (v_church_id, v_ccm_service_id, 'Emma Thompson', 'medical', 'low',
         'Child scraped knee on playground equipment during transition.',
         'Cleaned and applied bandage. Child returned to class.', true, false)
      on conflict do nothing;

    end if;
  end;

  raise notice 'Seed complete — Grace Harbor Church with 10 ministries, 22 profiles, operations data, track data for all 10 panel types + CCM demo service.';
end $$;
