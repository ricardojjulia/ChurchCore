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

  insert into public.churches (id, name, slug, timezone)
  values (v_church_id, 'Grace Harbor Church', 'grace-harbor', 'America/New_York')
  on conflict (id) do nothing;

  -- ── Profiles ────────────────────────────────────────────
  -- Upsert by email (the unique constraint) to handle auto-created profiles
  -- from the on_auth_user_created trigger. We use a temporary table to stage
  -- data, then update the known-email rows and insert new ones.

  -- Update or insert sarah
  update public.profiles
  set user_id = v_sarah_auth_id, church_id = v_church_id, full_name = 'Sarah Mitchell',
      role = 'church_admin', display_title = 'Church Administrator', membership_status = 'active'
  where email = 'sarah@churchcoreops.app';

  select id into v_sarah_id from public.profiles where email = 'sarah@churchcoreops.app' limit 1;

  -- Update or insert david
  update public.profiles
  set user_id = v_david_auth_id, church_id = v_church_id, full_name = 'David Chen',
      role = 'member_volunteer', membership_status = 'active'
  where email = 'david@graceharbor.church';

  select id into v_david_id from public.profiles where email = 'david@graceharbor.church' limit 1;

  -- Extra demo profiles (no auth user required)
  insert into public.profiles (id, church_id, full_name, email, role, display_title, membership_status)
  values
    (v_james_id,  v_church_id, 'James Ortega',    'james@graceharbor.church',   'member_volunteer',  'Worship Leader',         'active'),
    (v_aisha_id,  v_church_id, 'Aisha Thompson',  'aisha@graceharbor.church',   'member_volunteer',  null,                     'active'),
    (v_robert_id, v_church_id, 'Robert James',    'robert@graceharbor.church',  'member_volunteer',  'Men''s Ministry Leader',  'active'),
    (v_marcus_id, v_church_id, 'Marcus Williams', 'marcus@graceharbor.church',  'member_volunteer',  null,                     'active'),
    (v_linda_id,  v_church_id, 'Linda Nguyen',    'linda@graceharbor.church',   'member_volunteer',  'Women''s Ministry Lead',  'active'),
    (v_grace_id,  v_church_id, 'Grace Adeyemi',   'grace@graceharbor.church',   'member_volunteer',  null,                     'active')
  on conflict (id) do update set
    full_name     = excluded.full_name,
    display_title = excluded.display_title,
    role          = excluded.role;

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

  -- ── Tenant registry ─────────────────────────────────────
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
    (v_grace_id,  v_missions_id, v_church_id, 'member')
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

  raise notice 'Seed complete — Grace Harbor Church with 10 ministries, 8 profiles, track data for all 10 panel types + CCM demo service.';
end $$;
