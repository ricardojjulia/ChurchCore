#!/usr/bin/env node
/**
 * ChurchCore Ops — Hosted Demo Seed Script
 *
 * Seeds a hosted Supabase project with a complete Grace Harbor Church demo so
 * outside testers get a URL + credentials and zero local setup.
 *
 * Usage:
 *   TENANT_SUPABASE_URL=https://xxx.supabase.co \
 *   TENANT_SUPABASE_SERVICE_ROLE_KEY=eyJhbGci... \
 *   node scripts/seed-demo.mjs
 *
 * The script is fully idempotent — re-running it is safe.
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

// ── Env validation ────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.TENANT_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.TENANT_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('');
  console.error('ERROR: Missing required environment variables.');
  console.error('');
  console.error('  TENANT_SUPABASE_URL            — your hosted Supabase project URL');
  console.error('  TENANT_SUPABASE_SERVICE_ROLE_KEY — the service role key (not the anon key)');
  console.error('');
  console.error('Run with:');
  console.error('  TENANT_SUPABASE_URL=https://xxx.supabase.co \\');
  console.error('  TENANT_SUPABASE_SERVICE_ROLE_KEY=eyJhbGci... \\');
  console.error('  node scripts/seed-demo.mjs');
  console.error('');
  process.exit(1);
}

// ── Supabase client (service role — bypasses RLS) ─────────────────────────────

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Fixed stable IDs ──────────────────────────────────────────────────────────

const CHURCH_ID = '11111111-0000-0000-0000-000000000001';
const DEMO_PASSWORD = 'ChurchCoreDemo2026!';

const PROFILE_IDS = {
  admin:     '22222222-0000-0000-0000-100000000001',
  member:    '22222222-0000-0000-0000-100000000002',
  secretary: '22222222-0000-0000-0000-100000000003',
  pastor:    '22222222-0000-0000-0000-100000000004',
  leader:    '22222222-0000-0000-0000-100000000005',
  // Directory-only members (no auth user)
  james:     '22222222-0000-0000-0000-000000000003',
  aisha:     '22222222-0000-0000-0000-000000000004',
  linda:     '22222222-0000-0000-0000-000000000007',
  grace:     '22222222-0000-0000-0000-000000000008',
  elena:     '22222222-0000-0000-0000-000000000009',
  marcus:    '22222222-0000-0000-0000-000000000006',
  noah:      '22222222-0000-0000-0000-000000000012',
  peter:     '22222222-0000-0000-0000-000000000022',
  maya:      '22222222-0000-0000-0000-000000000011',
  samuel:    '22222222-0000-0000-0000-000000000016',
};

const MINISTRY_IDS = {
  worship:   '44444444-0000-0000-0000-000000000001',
  men:       '44444444-0000-0000-0000-000000000002',
  women:     '44444444-0000-0000-0000-000000000003',
  children:  '44444444-0000-0000-0000-000000000007',
  youth:     '44444444-0000-0000-0000-000000000008',
  youngAdult:'44444444-0000-0000-0000-000000000009',
};

const FAMILY_IDS = {
  mitchell:  '66666666-0000-0000-0000-100000000001',
  chen:      '66666666-0000-0000-0000-100000000002',
  ortega:    '66666666-0000-0000-0000-100000000003',
  nguyen:    '66666666-0000-0000-0000-100000000004',
  james:     '66666666-0000-0000-0000-100000000005',
};

const EVENT_IDS = {
  sunday:    '77777777-0000-0000-0000-100000000001',
  youth:     '77777777-0000-0000-0000-100000000002',
  food:      '77777777-0000-0000-0000-100000000003',
  class:     '77777777-0000-0000-0000-100000000004',
  banquet:   '77777777-0000-0000-0000-100000000005',
};

const FINANCE_IDS = {
  operating:  '64444444-0000-0000-0000-100000000001',
  general:    '64444444-0000-0000-0000-100000000002',
  missions:   '64444444-0000-0000-0000-100000000003',
  building:   '64444444-0000-0000-0000-100000000004',
  journal1:   '65555555-0000-0000-0000-100000000001',
  journal2:   '65555555-0000-0000-0000-100000000002',
  budget:     '66666666-0000-0000-0000-100000000001',
  givingGeneral: '68888888-0000-0000-0000-100000000001',
  givingMissions:'68888888-0000-0000-0000-100000000002',
  page:       '69999999-0000-0000-0000-100000000001',
};

const GROUP_IDS = {
  mensBible:    '62222222-0000-0000-0000-100000000001',
  youngAdults:  '62222222-0000-0000-0000-100000000002',
  sundaySchool: '62222222-0000-0000-0000-100000000003',
};

const SERVICE_PLAN_ID = '7a000000-0000-0000-0000-100000000001';

const CCM_SERVICE_ID  = 'cccccccc-0000-0000-0000-100000000001';
const CCM_ROOM_IDS = {
  nursery:     'cccccccc-0000-0000-0000-200000000001',
  elementary:  'cccccccc-0000-0000-0000-200000000002',
  preTeen:     'cccccccc-0000-0000-0000-200000000003',
};

// ── Counters (for summary report) ─────────────────────────────────────────────

const counts = {};

function track(table, n) {
  counts[table] = (counts[table] || 0) + n;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsert(table, rows, onConflict = 'id') {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const { error } = await supabase
    .from(table)
    .upsert(rows, { onConflict, ignoreDuplicates: false });
  if (error) {
    // Log the error but continue — some tables may not exist yet
    console.warn(`  WARN ${table}: ${error.message}`);
    return;
  }
  track(table, rows.length);
}

async function upsertIgnore(table, rows, onConflict = 'id') {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const { error } = await supabase
    .from(table)
    .upsert(rows, { onConflict, ignoreDuplicates: true });
  if (error) {
    console.warn(`  WARN ${table}: ${error.message}`);
    return;
  }
  track(table, rows.length);
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

function sundaysAgo(weeksBack) {
  const d = new Date();
  const day = d.getDay();
  const daysSinceSunday = day === 0 ? 0 : day;
  d.setDate(d.getDate() - daysSinceSunday - weeksBack * 7);
  d.setHours(10, 30, 0, 0);
  return d.toISOString();
}

function sundayDate(weeksBack) {
  return sundaysAgo(weeksBack).slice(0, 10);
}

function hoursAfter(isoString, h) {
  return new Date(new Date(isoString).getTime() + h * 3600000).toISOString();
}

// ── Step 0: Delete auto-created profiles from auth trigger ───────────────────
// Supabase auth triggers can auto-create profiles on user creation.
// Delete them first so we can insert with our stable fixed IDs.

async function deleteAutoCreatedProfiles() {
  const demoEmails = DEMO_USERS.map(u => u.email);
  // Delete FK dependents before deleting profiles
  await supabase.from('ccm_volunteer_assignments').delete().eq('church_id', CHURCH_ID);
  const { error } = await supabase.from('profiles').delete().in('email', demoEmails);
  if (error) console.warn(`  WARN pre-delete profiles: ${error.message}`);
}

async function deleteFinanceData() {
  // Delete in reverse FK order so no constraint violations
  await supabase.from('finance_budget_lines').delete().eq('church_id', CHURCH_ID);
  await supabase.from('finance_budgets').delete().eq('church_id', CHURCH_ID);
  await supabase.from('finance_journal_lines').delete().eq('church_id', CHURCH_ID);
  await supabase.from('finance_journals').delete().eq('church_id', CHURCH_ID);
  await supabase.from('giving_fund_accounts').delete().eq('church_id', CHURCH_ID);
  await supabase.from('finance_accounts').delete().eq('church_id', CHURCH_ID);
}

// ── Step 1: Create auth users ──────────────────────────────────────────────────

const DEMO_USERS = [
  {
    email: 'admin@graceharbor.church',
    password: DEMO_PASSWORD,
    role: 'church_admin',
    fullName: 'Sarah Mitchell',
    displayTitle: 'Church Administrator',
    memberNumber: 'GH-D001',
    familyId: FAMILY_IDS.mitchell,
    profileId: PROFILE_IDS.admin,
  },
  {
    email: 'member@graceharbor.church',
    password: DEMO_PASSWORD,
    role: 'member_volunteer',
    fullName: 'David Chen',
    displayTitle: null,
    memberNumber: 'GH-D002',
    familyId: FAMILY_IDS.chen,
    profileId: PROFILE_IDS.member,
  },
  {
    email: 'secretary@graceharbor.church',
    password: DEMO_PASSWORD,
    role: 'secretary',
    fullName: 'Olivia Reed',
    displayTitle: 'Secretary / Office Admin',
    memberNumber: 'GH-D003',
    familyId: null,
    profileId: PROFILE_IDS.secretary,
  },
  {
    email: 'pastor@graceharbor.church',
    password: DEMO_PASSWORD,
    role: 'pastor_elder',
    fullName: 'Miriam Cole',
    displayTitle: 'Pastor / Elder',
    memberNumber: 'GH-D004',
    familyId: null,
    profileId: PROFILE_IDS.pastor,
  },
  {
    email: 'leader@graceharbor.church',
    password: DEMO_PASSWORD,
    role: 'ministry_leader',
    fullName: 'Robert James',
    displayTitle: "Men's Ministry Leader",
    memberNumber: 'GH-D005',
    familyId: FAMILY_IDS.james,
    profileId: PROFILE_IDS.leader,
  },
];

async function seedAuthUsers() {
  console.log('Creating demo auth users...');
  const authIds = {};

  for (const user of DEMO_USERS) {
    // Check if user already exists
    const { data: existing } = await supabase.auth.admin.listUsers();
    const found = existing?.users?.find(u => u.email === user.email);

    if (found) {
      // Always reset password so demo credentials stay consistent
      const { error: updateError } = await supabase.auth.admin.updateUserById(found.id, {
        password: user.password,
        email_confirm: true,
      });
      if (updateError) {
        console.warn(`  WARN    ${user.email} (password reset): ${updateError.message}`);
      } else {
        console.log(`  UPDATED ${user.email}`);
      }
      authIds[user.email] = found.id;
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        full_name: user.fullName,
        church_id: CHURCH_ID,
        role: user.role,
      },
    });

    if (error) {
      console.warn(`  WARN    ${user.email}: ${error.message}`);
    } else {
      console.log(`  CREATED ${user.email}  (${data.user.id})`);
      authIds[user.email] = data.user.id;
    }
  }

  // Re-fetch all to get any that existed before
  const { data: allUsers } = await supabase.auth.admin.listUsers();
  for (const user of DEMO_USERS) {
    if (!authIds[user.email]) {
      const found = allUsers?.users?.find(u => u.email === user.email);
      if (found) authIds[user.email] = found.id;
    }
  }

  return authIds;
}

// ── Step 2: Church record ─────────────────────────────────────────────────────

async function seedChurch() {
  console.log('Upserting church...');
  await upsert('churches', [
    {
      id: CHURCH_ID,
      name: 'Grace Harbor Church',
      slug: 'grace-harbor',
      timezone: 'America/New_York',
    },
  ]);
}

// ── Step 3: Families ──────────────────────────────────────────────────────────

async function seedFamilies() {
  console.log('Upserting families...');
  await upsert('families', [
    { id: FAMILY_IDS.mitchell, church_id: CHURCH_ID, family_name: 'Mitchell Household', address: '14 Harbor Green, Brighton, MI', home_phone: '555-0101' },
    { id: FAMILY_IDS.chen,     church_id: CHURCH_ID, family_name: 'Chen Household',     address: '28 Harbor Green, Brighton, MI', home_phone: '555-0102' },
    { id: FAMILY_IDS.ortega,   church_id: CHURCH_ID, family_name: 'Ortega Household',   address: '103 River Road, Brighton, MI',  home_phone: '555-0103' },
    { id: FAMILY_IDS.nguyen,   church_id: CHURCH_ID, family_name: 'Nguyen Household',   address: '7 Maple Court, Brighton, MI',   home_phone: '555-0105' },
    { id: FAMILY_IDS.james,    church_id: CHURCH_ID, family_name: 'James Household',    address: '88 Willow Lane, Brighton, MI',  home_phone: '555-0104' },
  ]);
}

// ── Step 4: Profiles ──────────────────────────────────────────────────────────

async function seedProfiles(authIds) {
  console.log('Upserting profiles...');

  // Auth-linked demo user profiles
  const authProfiles = DEMO_USERS.map(user => ({
    id: user.profileId,
    user_id: authIds[user.email] ?? null,
    church_id: CHURCH_ID,
    full_name: user.fullName,
    email: user.email,
    phone: `555-110${DEMO_USERS.indexOf(user) + 1}`,
    role: user.role,
    display_title: user.displayTitle,
    is_pastoral: user.role === 'pastor_elder',
    membership_status: 'active',
    account_status: 'active',
    member_number: user.memberNumber,
    family_id: user.familyId ?? null,
    is_roster_eligible: true,
    preferred_contact_method: 'email',
    directory_visible: true,
    contact_allowed: true,
    joined_date: '2021-01-01',
  }));

  // Directory-only members (no auth user) — enrich the directory
  const directoryProfiles = [
    {
      id: PROFILE_IDS.james,  church_id: CHURCH_ID, full_name: 'James Ortega',   email: 'james@graceharbor.church',  phone: '555-1103',
      role: 'member_volunteer', display_title: 'Worship Leader', is_pastoral: false, membership_status: 'active', account_status: 'active',
      member_number: 'GH-D006', family_id: FAMILY_IDS.ortega, is_roster_eligible: true, preferred_contact_method: 'email', directory_visible: true, contact_allowed: true, joined_date: '2022-09-18',
    },
    {
      id: PROFILE_IDS.aisha,  church_id: CHURCH_ID, full_name: 'Aisha Thompson', email: 'aisha@graceharbor.church',  phone: '555-1104',
      role: 'member_volunteer', display_title: null, is_pastoral: false, membership_status: 'active', account_status: 'active',
      member_number: 'GH-D007', family_id: null, is_roster_eligible: true, preferred_contact_method: 'sms', directory_visible: true, contact_allowed: true, joined_date: '2023-01-22',
    },
    {
      id: PROFILE_IDS.marcus, church_id: CHURCH_ID, full_name: 'Marcus Williams', email: 'marcus@graceharbor.church', phone: '555-1106',
      role: 'member_volunteer', display_title: null, is_pastoral: false, membership_status: 'active', account_status: 'active',
      member_number: 'GH-D008', family_id: null, is_roster_eligible: true, preferred_contact_method: 'sms', directory_visible: true, contact_allowed: true, joined_date: '2023-11-05',
    },
    {
      id: PROFILE_IDS.linda,  church_id: CHURCH_ID, full_name: 'Linda Nguyen',    email: 'linda@graceharbor.church',  phone: '555-1107',
      role: 'ministry_leader', display_title: "Women's Ministry Lead", is_pastoral: false, membership_status: 'active', account_status: 'active',
      member_number: 'GH-D009', family_id: FAMILY_IDS.nguyen, is_roster_eligible: true, preferred_contact_method: 'email', directory_visible: true, contact_allowed: true, joined_date: '2020-04-19',
    },
    {
      id: PROFILE_IDS.grace,  church_id: CHURCH_ID, full_name: 'Grace Adeyemi',   email: 'grace@graceharbor.church',  phone: '555-1108',
      role: 'member_volunteer', display_title: null, is_pastoral: false, membership_status: 'active', account_status: 'active',
      member_number: 'GH-D010', family_id: null, is_roster_eligible: true, preferred_contact_method: 'email', directory_visible: true, contact_allowed: true, joined_date: '2024-02-04',
    },
    {
      id: PROFILE_IDS.elena,  church_id: CHURCH_ID, full_name: 'Elena Martinez',  email: 'elena@graceharbor.church',  phone: '555-1109',
      role: 'member_volunteer', display_title: 'Hospitality Coordinator', is_pastoral: false, membership_status: 'active', account_status: 'active',
      member_number: 'GH-D011', family_id: null, is_roster_eligible: true, preferred_contact_method: 'email', directory_visible: true, contact_allowed: true, joined_date: '2022-02-27',
    },
    {
      id: PROFILE_IDS.noah,   church_id: CHURCH_ID, full_name: 'Noah Brooks',     email: 'noah@graceharbor.church',   phone: '555-1112',
      role: 'member_volunteer', display_title: null, is_pastoral: false, membership_status: 'visitor', account_status: 'pending',
      member_number: 'GH-D012', family_id: null, is_roster_eligible: false, preferred_contact_method: 'email', directory_visible: true, contact_allowed: true, joined_date: '2026-04-12',
    },
    {
      id: PROFILE_IDS.peter,  church_id: CHURCH_ID, full_name: 'Peter Stone',     email: 'peter@graceharbor.church',  phone: null,
      role: 'member_volunteer', display_title: null, is_pastoral: false, membership_status: 'visitor', account_status: 'pending',
      member_number: 'GH-D013', family_id: null, is_roster_eligible: false, preferred_contact_method: 'email', directory_visible: true, contact_allowed: true, joined_date: '2026-05-03',
    },
    {
      id: PROFILE_IDS.maya,   church_id: CHURCH_ID, full_name: 'Maya Martinez',   email: 'maya@graceharbor.church',   phone: null,
      role: 'member_volunteer', display_title: null, is_pastoral: false, membership_status: 'active', account_status: 'pending',
      member_number: 'GH-D014', family_id: null, is_roster_eligible: false, preferred_contact_method: 'app', directory_visible: true, contact_allowed: true, joined_date: '2025-09-07',
    },
    {
      id: PROFILE_IDS.samuel, church_id: CHURCH_ID, full_name: 'Samuel Price',    email: 'samuel@graceharbor.church', phone: '555-1116',
      role: 'member_volunteer', display_title: 'Prayer Team Lead', is_pastoral: false, membership_status: 'active', account_status: 'active',
      member_number: 'GH-D015', family_id: null, is_roster_eligible: true, preferred_contact_method: 'email', directory_visible: true, contact_allowed: true, joined_date: '2020-10-11',
    },
  ];

  await upsert('profiles', [...authProfiles, ...directoryProfiles]);
}

// ── Step 5: Church memberships ────────────────────────────────────────────────

async function seedChurchMemberships(authIds) {
  console.log('Upserting church_memberships...');

  const roleMap = {
    church_admin:    'church_admin',
    member_volunteer: 'member',
    secretary:       'secretary',
    pastor_elder:    'pastor',
    ministry_leader: 'ministry_leader',
  };

  const memberships = DEMO_USERS
    .filter(u => authIds[u.email])
    .map(u => ({
      user_id:   authIds[u.email],
      church_id: CHURCH_ID,
      role:      roleMap[u.role] ?? 'member',
      is_active: true,
    }));

  await upsertIgnore('church_memberships', memberships, 'church_id,user_id,role');
}

// ── Step 6: Church settings ───────────────────────────────────────────────────

async function seedChurchSettings() {
  console.log('Upserting church_settings (if table exists)...');
  await upsertIgnore('church_settings', [
    {
      church_id:    CHURCH_ID,
      legal_name:   'Grace Harbor Community Church, Inc.',
      website:      'https://graceharbor.church',
      contact_email:'info@graceharbor.church',
      contact_phone:'555-0200',
      address:      '1 Harbor Way, Brighton, MI 48116',
      timezone:     'America/New_York',
    },
  ], 'church_id');
}

// ── Step 7: Ministries ────────────────────────────────────────────────────────

async function seedMinistries() {
  console.log('Upserting ministries...');
  await upsert('ministries', [
    { id: MINISTRY_IDS.worship,    church_id: CHURCH_ID, name: 'Worship Team',       slug: 'worship-team',    ministry_type: 'worship',     vision_statement: 'Lead the congregation into authentic encounter with God.',      health_score: 8.4 },
    { id: MINISTRY_IDS.children,   church_id: CHURCH_ID, name: "Children's Church",  slug: 'childrens-church', ministry_type: 'children',    vision_statement: 'Safe, joy-filled spaces where every child discovers their worth.',health_score: 8.5 },
    { id: MINISTRY_IDS.youth,      church_id: CHURCH_ID, name: 'Youth Ministry',     slug: 'youth-ministry',  ministry_type: 'youth',       vision_statement: 'Equipping the next generation to own their faith.',             health_score: 7.3 },
    { id: MINISTRY_IDS.men,        church_id: CHURCH_ID, name: "Men's Ministry",     slug: 'mens-ministry',   ministry_type: 'men',         vision_statement: 'Raise up men of integrity who lead their families well.',        health_score: 7.1 },
    { id: MINISTRY_IDS.women,      church_id: CHURCH_ID, name: "Women's Ministry",   slug: 'womens-ministry', ministry_type: 'women',       vision_statement: 'Connect women across every season of life.',                   health_score: 8.9 },
    { id: MINISTRY_IDS.youngAdult, church_id: CHURCH_ID, name: 'Young Adults',       slug: 'young-adults',    ministry_type: 'young_adult', vision_statement: 'Connecting career and calling for young adults.',               health_score: 7.9 },
  ]);
}

// ── Step 8: Profile ministries ────────────────────────────────────────────────

async function seedProfileMinistries() {
  console.log('Upserting profile_ministries...');
  await upsertIgnore('profile_ministries', [
    { profile_id: PROFILE_IDS.admin,  ministry_id: MINISTRY_IDS.worship,   church_id: CHURCH_ID, role: 'leader' },
    { profile_id: PROFILE_IDS.james,  ministry_id: MINISTRY_IDS.worship,   church_id: CHURCH_ID, role: 'assistant_leader' },
    { profile_id: PROFILE_IDS.member, ministry_id: MINISTRY_IDS.worship,   church_id: CHURCH_ID, role: 'member' },
    { profile_id: PROFILE_IDS.leader, ministry_id: MINISTRY_IDS.men,       church_id: CHURCH_ID, role: 'leader' },
    { profile_id: PROFILE_IDS.marcus, ministry_id: MINISTRY_IDS.men,       church_id: CHURCH_ID, role: 'member' },
    { profile_id: PROFILE_IDS.member, ministry_id: MINISTRY_IDS.men,       church_id: CHURCH_ID, role: 'member' },
    { profile_id: PROFILE_IDS.linda,  ministry_id: MINISTRY_IDS.women,     church_id: CHURCH_ID, role: 'leader' },
    { profile_id: PROFILE_IDS.grace,  ministry_id: MINISTRY_IDS.women,     church_id: CHURCH_ID, role: 'member' },
    { profile_id: PROFILE_IDS.admin,  ministry_id: MINISTRY_IDS.children,  church_id: CHURCH_ID, role: 'member' },
    { profile_id: PROFILE_IDS.secretary, ministry_id: MINISTRY_IDS.children, church_id: CHURCH_ID, role: 'leader' },
    { profile_id: PROFILE_IDS.james,  ministry_id: MINISTRY_IDS.youth,     church_id: CHURCH_ID, role: 'leader' },
    { profile_id: PROFILE_IDS.noah,   ministry_id: MINISTRY_IDS.youth,     church_id: CHURCH_ID, role: 'member' },
    { profile_id: PROFILE_IDS.aisha,  ministry_id: MINISTRY_IDS.youngAdult,church_id: CHURCH_ID, role: 'member' },
    { profile_id: PROFILE_IDS.marcus, ministry_id: MINISTRY_IDS.youngAdult,church_id: CHURCH_ID, role: 'leader' },
  ], 'profile_id,ministry_id');
}

// ── Step 9: Events ────────────────────────────────────────────────────────────

async function seedEvents() {
  console.log('Upserting events...');

  // Sunday this week (upcoming)
  const nextSunday   = daysFromNow(7 - new Date().getDay() || 7);
  const nextSundayEnd = new Date(nextSunday);
  nextSundayEnd.setMinutes(nextSundayEnd.getMinutes() + 90);

  await upsert('events', [
    {
      id: EVENT_IDS.sunday,
      church_id: CHURCH_ID,
      ministry_id: MINISTRY_IDS.worship,
      created_by: PROFILE_IDS.admin,
      title: 'Sunday Worship Gathering',
      description: 'Weekly worship service with children\'s ministry and hospitality teams. Roster confirmation needed.',
      location: 'Main Sanctuary',
      starts_at: nextSunday,
      ends_at: nextSundayEnd.toISOString(),
      category: 'worship',
      visibility: 'public',
      rsvp_enabled: true,
      capacity: 220,
      approval_status: 'approved',
    },
    {
      id: EVENT_IDS.youth,
      church_id: CHURCH_ID,
      ministry_id: MINISTRY_IDS.youth,
      created_by: PROFILE_IDS.leader,
      title: 'Youth Worship Night',
      description: 'Student worship, small groups, and parent pickup coordination.',
      location: 'Youth Room',
      starts_at: daysFromNow(5),
      ends_at: hoursAfter(daysFromNow(5), 2),
      category: 'ministry',
      visibility: 'members',
      rsvp_enabled: true,
      capacity: 80,
      approval_status: 'pending',
    },
    {
      id: EVENT_IDS.food,
      church_id: CHURCH_ID,
      ministry_id: MINISTRY_IDS.women,
      created_by: PROFILE_IDS.secretary,
      title: 'Neighborhood Food Pantry',
      description: 'Monthly pantry distribution — waitlist registrations present.',
      location: 'Community Hall',
      starts_at: daysFromNow(8),
      ends_at: hoursAfter(daysFromNow(8), 3),
      category: 'outreach',
      visibility: 'public',
      rsvp_enabled: true,
      capacity: 40,
      approval_status: 'approved',
    },
    {
      id: EVENT_IDS.class,
      church_id: CHURCH_ID,
      ministry_id: MINISTRY_IDS.youngAdult,
      created_by: PROFILE_IDS.secretary,
      title: 'Christianity 101',
      description: 'Six-week foundations class for new members and seekers.',
      location: 'Room 204',
      starts_at: daysFromNow(10),
      ends_at: hoursAfter(daysFromNow(10), 2),
      category: 'informational',
      visibility: 'members',
      rsvp_enabled: true,
      capacity: 24,
      approval_status: 'draft',
    },
    {
      id: EVENT_IDS.banquet,
      church_id: CHURCH_ID,
      ministry_id: MINISTRY_IDS.worship,
      created_by: PROFILE_IDS.admin,
      title: 'Annual Church Banquet',
      description: 'Formal dinner celebrating another year of ministry together. Tickets required — seats are limited.',
      location: 'Fellowship Hall',
      starts_at: daysFromNow(21),
      ends_at: hoursAfter(daysFromNow(21), 3),
      category: 'social',
      visibility: 'members',
      rsvp_enabled: true,
      capacity: 60,
      approval_status: 'approved',
    },
  ]);
}

// ── Step 10: Event registration settings ─────────────────────────────────────

async function seedEventRegistrationSettings() {
  console.log('Upserting event_registration_settings...');
  await upsert('event_registration_settings', [
    { event_id: EVENT_IDS.sunday,  church_id: CHURCH_ID, registration_open: true, capacity: 220, price_cents: 0,    currency: 'usd', deadline: daysFromNow(6),  confirmation_message: 'We look forward to worshiping with you.', waitlist_enabled: true },
    { event_id: EVENT_IDS.youth,   church_id: CHURCH_ID, registration_open: true, capacity: 80,  price_cents: 0,    currency: 'usd', deadline: daysFromNow(4),  confirmation_message: 'Bring a friend and arrive by 6:30 PM.', waitlist_enabled: true },
    { event_id: EVENT_IDS.food,    church_id: CHURCH_ID, registration_open: true, capacity: 40,  price_cents: 0,    currency: 'usd', deadline: daysFromNow(7),  confirmation_message: 'Thank you for volunteering!', waitlist_enabled: true },
    { event_id: EVENT_IDS.class,   church_id: CHURCH_ID, registration_open: true, capacity: 24,  price_cents: 0,    currency: 'usd', deadline: daysFromNow(9),  confirmation_message: 'Class materials will be provided.', waitlist_enabled: false },
    { event_id: EVENT_IDS.banquet, church_id: CHURCH_ID, registration_open: true, capacity: 60,  price_cents: 3500, currency: 'usd', deadline: daysFromNow(18), confirmation_message: 'Your seat is reserved! We look forward to seeing you.', waitlist_enabled: false },
  ], 'event_id');
}

// ── Step 11: Event registrations ─────────────────────────────────────────────

async function seedEventRegistrations() {
  console.log('Upserting event_registrations...');
  await upsertIgnore('event_registrations', [
    { id: randomUUID(), event_id: EVENT_IDS.sunday, church_id: CHURCH_ID, profile_id: PROFILE_IDS.member,  registrant_name: 'David Chen',     registrant_email: 'member@graceharbor.church', registrant_phone: '555-1102', status: 'confirmed', is_waitlisted: false, notes: null },
    { id: randomUUID(), event_id: EVENT_IDS.sunday, church_id: CHURCH_ID, profile_id: PROFILE_IDS.linda,   registrant_name: 'Linda Nguyen',   registrant_email: 'linda@graceharbor.church',  registrant_phone: '555-1107', status: 'confirmed', is_waitlisted: false, notes: null },
    { id: randomUUID(), event_id: EVENT_IDS.sunday, church_id: CHURCH_ID, profile_id: PROFILE_IDS.noah,    registrant_name: 'Noah Brooks',    registrant_email: 'noah@graceharbor.church',   registrant_phone: '555-1112', status: 'confirmed', is_waitlisted: false, notes: 'First-time Sunday guest.' },
    // Waitlisted — triggers readiness flag
    { id: randomUUID(), event_id: EVENT_IDS.food,   church_id: CHURCH_ID, profile_id: PROFILE_IDS.maya,    registrant_name: 'Maya Martinez',  registrant_email: 'maya@graceharbor.church',   registrant_phone: null,       status: 'waitlisted', is_waitlisted: true,  notes: 'Waitlisted — pantry at capacity.' },
    { id: randomUUID(), event_id: EVENT_IDS.food,   church_id: CHURCH_ID, profile_id: PROFILE_IDS.peter,   registrant_name: 'Peter Stone',    registrant_email: 'peter@graceharbor.church',  registrant_phone: null,       status: 'waitlisted', is_waitlisted: true,  notes: 'Waitlisted — added day of.' },
    { id: randomUUID(), event_id: EVENT_IDS.class,  church_id: CHURCH_ID, profile_id: PROFILE_IDS.samuel,  registrant_name: 'Samuel Price',   registrant_email: 'samuel@graceharbor.church', registrant_phone: '555-1116', status: 'confirmed', is_waitlisted: false, notes: null },
  ]);
}

// ── Step 12: Event rosters ────────────────────────────────────────────────────

async function seedEventRosters() {
  console.log('Upserting event_rosters...');
  await upsertIgnore('event_rosters', [
    { church_id: CHURCH_ID, event_id: EVENT_IDS.sunday, profile_id: PROFILE_IDS.admin,     role_title: 'Service Coordinator', is_confirmed: true },
    { church_id: CHURCH_ID, event_id: EVENT_IDS.sunday, profile_id: PROFILE_IDS.james,     role_title: 'Worship Lead',        is_confirmed: true },
    // Unconfirmed — triggers readiness flag
    { church_id: CHURCH_ID, event_id: EVENT_IDS.sunday, profile_id: PROFILE_IDS.secretary, role_title: "Children's Lead",     is_confirmed: false },
    { church_id: CHURCH_ID, event_id: EVENT_IDS.food,   profile_id: PROFILE_IDS.elena,     role_title: 'Hospitality Lead',    is_confirmed: true },
    { church_id: CHURCH_ID, event_id: EVENT_IDS.food,   profile_id: PROFILE_IDS.grace,     role_title: 'Prayer Team',         is_confirmed: true },
  ], 'event_id,profile_id,role_title');
}

// ── Step 13: Attendance (historical 8 Sundays) ────────────────────────────────

async function seedAttendance() {
  console.log('Upserting attendance and service_attendance...');

  // service_attendance headcounts for 8 past Sundays
  const headcounts = [158, 171, 165, 184, 176, 192, 198, 205];
  const serviceAttendanceRows = headcounts.map((headcount, i) => ({
    id: `73333333-0000-0000-${String(i).padStart(4, '0')}-100000000001`,
    church_id: CHURCH_ID,
    service_date: sundayDate(8 - i),
    service_type: 'sunday_morning',
    headcount,
    notes: i === 7 ? 'Easter bump — highest of the year.' : null,
  }));
  await upsert('service_attendance', serviceAttendanceRows);

  // Individual attendance for a few key members across last 8 Sundays
  const attendees = [PROFILE_IDS.admin, PROFILE_IDS.member, PROFILE_IDS.james, PROFILE_IDS.linda];
  const attendanceRows = [];
  for (let w = 8; w >= 1; w--) {
    for (const profileId of attendees) {
      attendanceRows.push({
        id: randomUUID(),
        church_id: CHURCH_ID,
        profile_id: profileId,
        event_id: null,
        service_date: sundayDate(w),
        checked_in_at: sundaysAgo(w),
        status: 'present',
      });
    }
  }
  await upsertIgnore('attendance', attendanceRows);
}

// ── Step 14: Children's ministry (CCM) ───────────────────────────────────────

async function seedCCM() {
  console.log('Upserting CCM data...');

  // Rooms
  await upsert('children_rooms', [
    { id: CCM_ROOM_IDS.nursery,    ministry_id: MINISTRY_IDS.children, church_id: CHURCH_ID, name: 'Nursery (0–2)',     age_min: 0,  age_max: 2,  capacity: 12, target_ratio: 4.0, is_active: true },
    { id: CCM_ROOM_IDS.elementary, ministry_id: MINISTRY_IDS.children, church_id: CHURCH_ID, name: 'Elementary (7–10)',age_min: 7,  age_max: 10, capacity: 24, target_ratio: 8.0, is_active: true },
    { id: CCM_ROOM_IDS.preTeen,    ministry_id: MINISTRY_IDS.children, church_id: CHURCH_ID, name: 'Pre-Teen (11–12)', age_min: 11, age_max: 12, capacity: 20, target_ratio: 7.0, is_active: true },
  ]);

  // Active service
  await upsertIgnore('ccm_services', [
    {
      id: CCM_SERVICE_ID,
      church_id: CHURCH_ID,
      ministry_id: MINISTRY_IDS.children,
      service_name: "Sunday Children's Church",
      service_date: new Date().toISOString().slice(0, 10),
      status: 'open',
      started_at: new Date().toISOString(),
    },
  ]);

  // 3 checked-in children
  await upsertIgnore('ccm_checkin_sessions', [
    {
      id: 'cccccccc-0000-0000-0000-300000000001',
      church_id: CHURCH_ID,
      service_id: CCM_SERVICE_ID,
      room_id: CCM_ROOM_IDS.nursery,
      child_profile_id: null,
      child_name: 'Emma Thompson',
      guardian_name: 'Laura Thompson',
      pin_hash: '$2b$12$demo.hash.value.for.dev.only.not.real.bcrypt.xxxxxxxxxx',
      current_room_id: CCM_ROOM_IDS.nursery,
      is_first_visit: false,
      status: 'checked_in',
    },
    {
      id: 'cccccccc-0000-0000-0000-300000000002',
      church_id: CHURCH_ID,
      service_id: CCM_SERVICE_ID,
      room_id: CCM_ROOM_IDS.nursery,
      child_profile_id: null,
      child_name: 'Noah Martinez',
      guardian_name: 'Carlos Martinez',
      pin_hash: '$2b$12$demo.hash.value.for.dev.only.not.real.bcrypt.xxxxxxxxxx',
      current_room_id: CCM_ROOM_IDS.nursery,
      is_first_visit: true,
      status: 'checked_in',
    },
    {
      id: 'cccccccc-0000-0000-0000-300000000003',
      church_id: CHURCH_ID,
      service_id: CCM_SERVICE_ID,
      room_id: CCM_ROOM_IDS.elementary,
      child_profile_id: null,
      child_name: 'Sophie Johnson',
      guardian_name: 'Rachel Johnson',
      pin_hash: '$2b$12$demo.hash.value.for.dev.only.not.real.bcrypt.xxxxxxxxxx',
      current_room_id: CCM_ROOM_IDS.elementary,
      is_first_visit: false,
      status: 'checked_in',
    },
  ]);

  // 2 volunteers — satisfies the 2-adult rule
  await upsertIgnore('ccm_volunteer_assignments', [
    {
      church_id: CHURCH_ID,
      service_id: CCM_SERVICE_ID,
      room_id: CCM_ROOM_IDS.nursery,
      profile_id: PROFILE_IDS.admin,
      role: 'lead_teacher',
      background_check_verified: true,
      checked_in_at: new Date().toISOString(),
    },
    {
      church_id: CHURCH_ID,
      service_id: CCM_SERVICE_ID,
      room_id: CCM_ROOM_IDS.nursery,
      profile_id: PROFILE_IDS.member,
      role: 'assistant',
      background_check_verified: true,
      checked_in_at: new Date().toISOString(),
    },
  ], 'service_id,room_id,profile_id');

  // 1 open incident — triggers readiness follow-up flag
  await upsertIgnore('ccm_incidents', [
    {
      church_id: CHURCH_ID,
      service_id: CCM_SERVICE_ID,
      child_name: 'Emma Thompson',
      incident_type: 'medical',
      severity: 'low',
      description: 'Child scraped knee on playground equipment during class transition.',
      actions_taken: 'Cleaned and applied bandage. Child returned to class.',
      guardian_notified: true,
      follow_up_required: true,
    },
  ]);
}

// ── Step 15: Finance accounts ─────────────────────────────────────────────────

async function seedFinanceAccounts() {
  console.log('Upserting finance_accounts...');
  await upsert('finance_accounts', [
    { id: FINANCE_IDS.operating, church_id: CHURCH_ID, account_code: '1000', name: 'Operating Checking',       description: 'Primary operating bank account.',      account_type: 'asset',  is_active: true },
    { id: FINANCE_IDS.general,   church_id: CHURCH_ID, account_code: '4000', name: 'General Contributions',    description: 'General fund giving income.',           account_type: 'income', is_active: true },
    { id: FINANCE_IDS.missions,  church_id: CHURCH_ID, account_code: '4010', name: 'Missions Contributions',   description: 'Designated missions giving.',           account_type: 'income', is_active: true },
    { id: FINANCE_IDS.building,  church_id: CHURCH_ID, account_code: '4020', name: 'Building Fund Contributions', description: 'Designated building fund giving.',   account_type: 'income', is_active: true },
  ]);
}

// ── Step 16: Giving fund accounts ────────────────────────────────────────────

async function seedGivingFundAccounts() {
  console.log('Upserting giving_fund_accounts...');
  await upsert('giving_fund_accounts', [
    { id: FINANCE_IDS.givingGeneral,  church_id: CHURCH_ID, fund_designation: 'General Fund', asset_account_id: FINANCE_IDS.operating, income_account_id: FINANCE_IDS.general,  is_active: true },
    { id: FINANCE_IDS.givingMissions, church_id: CHURCH_ID, fund_designation: 'Missions Fund', asset_account_id: FINANCE_IDS.operating, income_account_id: FINANCE_IDS.missions, is_active: true },
  ]);
}

// ── Step 17: Public giving page ───────────────────────────────────────────────

async function seedPublicGivingPage() {
  console.log('Upserting public_giving_pages...');
  await upsert('public_giving_pages', [
    {
      id: FINANCE_IDS.page,
      church_id: CHURCH_ID,
      slug: 'grace-harbor',
      headline: 'Give to Grace Harbor',
      description: 'Support ministry, missions, and community outreach through secure online giving.',
      funds: JSON.stringify(['General Fund', 'Missions Fund', 'Building Fund']),
      stripe_account_id: 'acct_demo_grace_harbor',
      is_live: true,
      allow_anonymous: true,
    },
  ], 'church_id');
}

// ── Step 18: Donations ────────────────────────────────────────────────────────

async function seedDonations() {
  console.log('Upserting donations...');
  await upsertIgnore('donations', [
    // Succeeded — receipt sent
    { id: 'd1000000-0000-0000-0000-100000000001', church_id: CHURCH_ID, profile_id: PROFILE_IDS.admin,  donor_name: 'Sarah Mitchell',  donor_email: 'admin@graceharbor.church',   amount_cents: 15000, currency: 'usd', fund_designation: 'General Fund',  stripe_payment_intent_id: 'pi_demo_d001', is_recurring: false, status: 'succeeded', is_anonymous: false, receipt_sent_at: daysFromNow(-2), note: 'Sunday giving.',      created_at: daysFromNow(-5) },
    { id: 'd1000000-0000-0000-0000-100000000002', church_id: CHURCH_ID, profile_id: PROFILE_IDS.member, donor_name: 'David Chen',      donor_email: 'member@graceharbor.church',  amount_cents:  7500, currency: 'usd', fund_designation: 'Missions Fund', stripe_payment_intent_id: 'pi_demo_d002', is_recurring: true,  status: 'succeeded', is_anonymous: false, receipt_sent_at: null,          note: 'Recurring missions support.', created_at: daysFromNow(-4) },
    // Succeeded but no GL post (unposted — triggers readiness)
    { id: 'd1000000-0000-0000-0000-100000000003', church_id: CHURCH_ID, profile_id: PROFILE_IDS.linda,  donor_name: 'Linda Nguyen',    donor_email: 'linda@graceharbor.church',   amount_cents:  5000, currency: 'usd', fund_designation: 'Building Fund', stripe_payment_intent_id: 'pi_demo_d003', is_recurring: false, status: 'succeeded', is_anonymous: false, receipt_sent_at: null, note: 'Building fund — unmapped.', created_at: daysFromNow(-3) },
    { id: 'd1000000-0000-0000-0000-100000000004', church_id: CHURCH_ID, profile_id: PROFILE_IDS.noah,   donor_name: 'Noah Brooks',     donor_email: 'noah@graceharbor.church',    amount_cents:  2500, currency: 'usd', fund_designation: 'General Fund',  stripe_payment_intent_id: 'pi_demo_d004', is_recurring: false, status: 'pending',   is_anonymous: false, receipt_sent_at: null, note: 'Pending payment demo.',     created_at: daysFromNow(-1) },
    // Anonymous succeeded
    { id: 'd1000000-0000-0000-0000-100000000005', church_id: CHURCH_ID, profile_id: null,              donor_name: 'Anonymous Donor', donor_email: 'anonymous@example.com',      amount_cents: 10000, currency: 'usd', fund_designation: 'General Fund',  stripe_payment_intent_id: 'pi_demo_d005', is_recurring: false, status: 'succeeded', is_anonymous: true,  receipt_sent_at: daysFromNow(-1), note: 'Anonymous demo gift.',       created_at: daysFromNow(-2) },
    // Failed — triggers readiness critical flag
    { id: 'd1000000-0000-0000-0000-100000000006', church_id: CHURCH_ID, profile_id: PROFILE_IDS.peter,  donor_name: 'Peter Stone',     donor_email: 'peter@graceharbor.church',   amount_cents:  4000, currency: 'usd', fund_designation: 'General Fund',  stripe_payment_intent_id: 'pi_demo_d006', is_recurring: false, status: 'failed',    is_anonymous: false, receipt_sent_at: null, note: 'Failed payment demo.',       created_at: daysFromNow(-0.5) },
  ]);
}

// ── Step 19: Finance journals ─────────────────────────────────────────────────

async function seedFinanceJournals() {
  console.log('Upserting finance_journals...');
  await upsert('finance_journals', [
    {
      id: FINANCE_IDS.journal1,
      church_id: CHURCH_ID,
      journal_date: daysFromNow(-7).slice(0, 10),
      description: 'Draft payroll journal — pending review',
      journal_type: 'general',
      status: 'draft',
      reference: 'PAY-2026-DRAFT',
      created_by: PROFILE_IDS.admin,
    },
    {
      id: FINANCE_IDS.journal2,
      church_id: CHURCH_ID,
      journal_date: daysFromNow(-14).slice(0, 10),
      description: 'Sunday tithes batch — posted',
      journal_type: 'giving',
      status: 'posted',
      reference: 'TITHE-2026-BATCH-01',
      posted_by: PROFILE_IDS.admin,
      posted_at: daysFromNow(-13),
      created_by: PROFILE_IDS.admin,
    },
  ]);
}

// ── Step 20: Finance journal lines ───────────────────────────────────────────

async function seedFinanceJournalLines() {
  console.log('Upserting finance_journal_lines...');

  // Draft journal lines — use side/amount_cents/memo/sort_order (NOT debit_cents/credit_cents)
  await upsert('finance_journal_lines', [
    { id: 'f1100000-0000-0000-0000-100000000001', journal_id: FINANCE_IDS.journal1, church_id: CHURCH_ID, account_id: FINANCE_IDS.operating, side: 'debit',  amount_cents: 500000, memo: 'Payroll deposit — pending', sort_order: 1 },
    { id: 'f1100000-0000-0000-0000-100000000002', journal_id: FINANCE_IDS.journal1, church_id: CHURCH_ID, account_id: FINANCE_IDS.general,   side: 'credit', amount_cents: 500000, memo: 'General fund payroll',      sort_order: 2 },
    // Posted journal lines
    { id: 'f1100000-0000-0000-0000-100000000003', journal_id: FINANCE_IDS.journal2, church_id: CHURCH_ID, account_id: FINANCE_IDS.operating, side: 'debit',  amount_cents: 185000, memo: 'Deposited Sunday tithes',   sort_order: 1 },
    { id: 'f1100000-0000-0000-0000-100000000004', journal_id: FINANCE_IDS.journal2, church_id: CHURCH_ID, account_id: FINANCE_IDS.general,   side: 'credit', amount_cents: 150000, memo: 'General fund receipts',     sort_order: 2 },
    { id: 'f1100000-0000-0000-0000-100000000005', journal_id: FINANCE_IDS.journal2, church_id: CHURCH_ID, account_id: FINANCE_IDS.missions,  side: 'credit', amount_cents:  35000, memo: 'Missions designation',      sort_order: 3 },
  ]);
}

// ── Step 21: Finance budget ───────────────────────────────────────────────────

async function seedFinanceBudget() {
  console.log('Upserting finance_budgets and finance_budget_lines...');
  await upsert('finance_budgets', [
    {
      id: FINANCE_IDS.budget,
      church_id: CHURCH_ID,
      name: 'FY2026 Operating Budget',
      fiscal_year: 2026,
      notes: 'Working budget for ministry leads and stewardship review.',
      is_active: true,
      created_by: PROFILE_IDS.admin,
    },
  ]);

  await upsert('finance_budget_lines', [
    { id: 'b1100000-0000-0000-0000-100000000001', budget_id: FINANCE_IDS.budget, church_id: CHURCH_ID, account_id: FINANCE_IDS.general,  amount_cents: 7200000, notes: 'Annual general giving projection' },
    { id: 'b1100000-0000-0000-0000-100000000002', budget_id: FINANCE_IDS.budget, church_id: CHURCH_ID, account_id: FINANCE_IDS.missions, amount_cents:  960000, notes: 'Global partner support and trips' },
    { id: 'b1100000-0000-0000-0000-100000000003', budget_id: FINANCE_IDS.budget, church_id: CHURCH_ID, account_id: FINANCE_IDS.building, amount_cents:  480000, notes: 'Building fund campaign target' },
    { id: 'b1100000-0000-0000-0000-100000000004', budget_id: FINANCE_IDS.budget, church_id: CHURCH_ID, account_id: FINANCE_IDS.operating,amount_cents: 1200000, notes: 'Operating reserve target' },
  ]);
}

// ── Step 22: Groups ───────────────────────────────────────────────────────────

async function seedGroups() {
  console.log('Upserting groups...');
  await upsert('groups', [
    { id: GROUP_IDS.mensBible,   church_id: CHURCH_ID, name: "Men's Bible Study",      description: 'Weekly discipleship and prayer — Tuesdays 7 PM.', category: 'discipleship', leader_profile_id: PROFILE_IDS.leader, meeting_day: 'Tuesday',   meeting_time: '7:00 PM', meeting_location: 'Room B4',    capacity: 16, is_open: true,  is_active: true },
    { id: GROUP_IDS.youngAdults, church_id: CHURCH_ID, name: 'Young Adults Connect',   description: 'Faith, work, and calling for young adults.',       category: 'life_stage',   leader_profile_id: PROFILE_IDS.grace,  meeting_day: 'Thursday',  meeting_time: '6:30 PM', meeting_location: 'Coffee Loft',capacity: 18, is_open: true,  is_active: true },
    { id: GROUP_IDS.sundaySchool,church_id: CHURCH_ID, name: 'Sunday School',          description: 'Adult Sunday school — Room 204.',                  category: 'discipleship', leader_profile_id: PROFILE_IDS.samuel, meeting_day: 'Sunday',    meeting_time: '9:00 AM', meeting_location: 'Room 204',   capacity: 30, is_open: false, is_active: true },
  ]);
}

// ── Step 23: Group members ────────────────────────────────────────────────────

async function seedGroupMembers() {
  console.log('Upserting group_members...');
  await upsert('group_members', [
    { id: '76666666-0000-0000-0000-100000000001', group_id: GROUP_IDS.mensBible,   church_id: CHURCH_ID, profile_id: PROFILE_IDS.leader, role: 'leader',    status: 'active' },
    { id: '76666666-0000-0000-0000-100000000002', group_id: GROUP_IDS.mensBible,   church_id: CHURCH_ID, profile_id: PROFILE_IDS.member, role: 'member',    status: 'active' },
    { id: '76666666-0000-0000-0000-100000000003', group_id: GROUP_IDS.mensBible,   church_id: CHURCH_ID, profile_id: PROFILE_IDS.marcus, role: 'co_leader', status: 'active' },
    { id: '76666666-0000-0000-0000-100000000004', group_id: GROUP_IDS.youngAdults, church_id: CHURCH_ID, profile_id: PROFILE_IDS.grace,  role: 'leader',    status: 'active' },
    { id: '76666666-0000-0000-0000-100000000005', group_id: GROUP_IDS.youngAdults, church_id: CHURCH_ID, profile_id: PROFILE_IDS.aisha,  role: 'member',    status: 'active' },
    { id: '76666666-0000-0000-0000-100000000006', group_id: GROUP_IDS.youngAdults, church_id: CHURCH_ID, profile_id: PROFILE_IDS.james,  role: 'member',    status: 'active' },
    { id: '76666666-0000-0000-0000-100000000007', group_id: GROUP_IDS.sundaySchool,church_id: CHURCH_ID, profile_id: PROFILE_IDS.samuel, role: 'leader',    status: 'active' },
    { id: '76666666-0000-0000-0000-100000000008', group_id: GROUP_IDS.sundaySchool,church_id: CHURCH_ID, profile_id: PROFILE_IDS.admin,  role: 'member',    status: 'active' },
  ]);
}

// ── Step 24: Service plans (volunteers) ───────────────────────────────────────

async function seedServicePlans() {
  console.log('Upserting service_plans...');
  const planDate = daysFromNow(7 - new Date().getDay() || 7).slice(0, 10);

  await upsert('service_plans', [
    {
      id: SERVICE_PLAN_ID,
      church_id: CHURCH_ID,
      name: `Sunday Worship Plan — ${planDate}`,
      service_date: planDate,
      notes: 'Confirm all positions before Thursday.',
      status: 'draft',
      created_by: PROFILE_IDS.admin,
    },
  ]);

  await upsert('service_plan_positions', [
    { id: '7d100000-0000-0000-0000-100000000001', plan_id: SERVICE_PLAN_ID, church_id: CHURCH_ID, role_name: 'Worship Leader', quantity_needed: 1, sort_order: 1 },
    { id: '7d100000-0000-0000-0000-100000000002', plan_id: SERVICE_PLAN_ID, church_id: CHURCH_ID, role_name: 'Tech / Slides',  quantity_needed: 1, sort_order: 2 },
    { id: '7d100000-0000-0000-0000-100000000003', plan_id: SERVICE_PLAN_ID, church_id: CHURCH_ID, role_name: 'Greeter',        quantity_needed: 1, sort_order: 3 },
  ]);
}

// ── Step 25: Communications ───────────────────────────────────────────────────

async function seedCommunications() {
  console.log('Upserting notification_preferences...');
  await upsert('notification_preferences', [
    { church_id: CHURCH_ID, profile_id: PROFILE_IDS.admin,     email_opt_in: true,  sms_opt_in: true,  push_opt_in: true  },
    { church_id: CHURCH_ID, profile_id: PROFILE_IDS.member,    email_opt_in: true,  sms_opt_in: true,  push_opt_in: false },
    { church_id: CHURCH_ID, profile_id: PROFILE_IDS.secretary, email_opt_in: true,  sms_opt_in: false, push_opt_in: false },
    { church_id: CHURCH_ID, profile_id: PROFILE_IDS.pastor,    email_opt_in: true,  sms_opt_in: false, push_opt_in: false },
    { church_id: CHURCH_ID, profile_id: PROFILE_IDS.leader,    email_opt_in: true,  sms_opt_in: true,  push_opt_in: false },
  ], 'church_id,profile_id');

  console.log('Upserting communication_logs...');
  await upsertIgnore('communication_logs', [
    // Sent
    { id: '7b100000-0000-0000-0000-100000000001', church_id: CHURCH_ID, sent_by: PROFILE_IDS.admin, recipient_id: PROFILE_IDS.member,    channel: 'email', subject: 'Thanks for visiting Grace Harbor',       body_preview: 'We were grateful to meet you Sunday.',                   status: 'sent',    sent_at: daysFromNow(-1), scheduled_for: null, error_message: null },
    { id: '7b100000-0000-0000-0000-100000000002', church_id: CHURCH_ID, sent_by: PROFILE_IDS.admin, recipient_id: PROFILE_IDS.leader,    channel: 'email', subject: 'Weekend serving brief',                  body_preview: 'Final details for Sunday teams.',                         status: 'sent',    sent_at: daysFromNow(-2), scheduled_for: null, error_message: null },
    // Queued
    { id: '7b100000-0000-0000-0000-100000000003', church_id: CHURCH_ID, sent_by: PROFILE_IDS.admin, recipient_id: null,                  channel: 'email', subject: 'Church-wide prayer night this Wednesday', body_preview: 'Join us for prayer and worship as we prepare for Sunday.', status: 'queued',  sent_at: null,            scheduled_for: daysFromNow(2), error_message: null },
    // Failed — triggers readiness flag
    { id: '7b100000-0000-0000-0000-100000000004', church_id: CHURCH_ID, sent_by: PROFILE_IDS.secretary, recipient_id: PROFILE_IDS.peter, channel: 'email', subject: 'Christianity 101 registration confirmed',  body_preview: 'See you this Sunday!',                                    status: 'failed',  sent_at: null,            scheduled_for: null, error_message: 'Demo Twilio failure — unreachable number.' },
    // Bounced — triggers readiness flag
    { id: '7b100000-0000-0000-0000-100000000005', church_id: CHURCH_ID, sent_by: PROFILE_IDS.admin, recipient_id: null,                  channel: 'email', subject: 'Food pantry volunteers',                  body_preview: 'Reminder for Saturday pantry setup.',                     status: 'bounced', sent_at: null,            scheduled_for: null, error_message: 'Demo bounce — outdated email address on list.' },
  ]);

  console.log('Upserting communication_suppressions...');
  await upsertIgnore('communication_suppressions', [
    {
      church_id: CHURCH_ID,
      channel: 'email',
      contact: 'unsubscribed-demo@example.com',
      reason: 'unsubscribe',
    },
  ], 'church_id,channel,contact');
}

// ── Step 26: Account requests ─────────────────────────────────────────────────

async function seedAccountRequests() {
  console.log('Upserting account_requests...');
  await upsertIgnore('account_requests', [
    // 2 new visitors
    { id: 'a3100000-0000-0000-0000-100000000001', church_id: CHURCH_ID, profile_id: null,             email: 'talia.grant@example.com',   phone: '555-1301', first_name: 'Talia',  last_name: 'Grant',   is_existing_member: false, status: 'pending' },
    { id: 'a3100000-0000-0000-0000-100000000002', church_id: CHURCH_ID, profile_id: null,             email: 'brandon.price@example.com', phone: '555-1302', first_name: 'Brandon',last_name: 'Price',   is_existing_member: false, status: 'pending' },
    // 1 existing member match
    { id: 'a3100000-0000-0000-0000-100000000003', church_id: CHURCH_ID, profile_id: PROFILE_IDS.maya, email: 'maya@graceharbor.church',   phone: null,       first_name: 'Maya',   last_name: 'Martinez',is_existing_member: true,  status: 'pending' },
  ]);
}

// ── Step 27: Care assignments ─────────────────────────────────────────────────

async function seedCareAssignments() {
  console.log('Upserting care_assignments...');
  await upsertIgnore('care_assignments', [
    // Open hospital follow-up
    { id: 'ca100000-0000-0000-0000-100000000001', church_id: CHURCH_ID, profile_id: PROFILE_IDS.elena, created_by: PROFILE_IDS.admin, assigned_to: PROFILE_IDS.pastor, summary: 'Hospital follow-up and meal train coordination after surgery.', status: 'open',     priority: 'urgent',  due_at: daysFromNow(1), last_contact_at: null },
    // Closed reconnect
    { id: 'ca100000-0000-0000-0000-100000000002', church_id: CHURCH_ID, profile_id: PROFILE_IDS.noah,  created_by: PROFILE_IDS.admin, assigned_to: PROFILE_IDS.admin, summary: 'First-time visitor follow-up after Sunday registration.',       status: 'closed',    priority: 'high',    due_at: daysFromNow(2), last_contact_at: daysFromNow(-1) },
  ]);
}

// ── Step 28: Daily work items ─────────────────────────────────────────────────

async function seedDailyWorkItems() {
  console.log('Upserting daily_work_items...');
  await upsertIgnore('daily_work_items', [
    { church_id: CHURCH_ID, item_type: 'call',    title: 'Return call to Noah Brooks',             body: "First-time visitor — ask about children's check-in and membership class.",           status: 'open',      priority: 'high',   direction: 'outgoing', related_profile_id: PROFILE_IDS.noah,  assigned_to_profile_id: PROFILE_IDS.secretary, scheduled_at: null, due_at: daysFromNow(0.1),  location: null, created_by: PROFILE_IDS.admin },
    { church_id: CHURCH_ID, item_type: 'visit',   title: 'Hospital follow-up with Elena Martinez', body: 'Confirm meal train coverage and note any pastoral care needs.',                       status: 'scheduled', priority: 'urgent', direction: null,       related_profile_id: PROFILE_IDS.elena, assigned_to_profile_id: PROFILE_IDS.pastor,     scheduled_at: daysFromNow(0.2), due_at: daysFromNow(0.2), location: 'Brighton Medical Center', created_by: PROFILE_IDS.admin },
    { church_id: CHURCH_ID, item_type: 'checkup', title: 'Review pending account approval queue',  body: 'Three portal requests waiting — review before end of business day.',                  status: 'open',      priority: 'normal', direction: null,       related_profile_id: null,              assigned_to_profile_id: PROFILE_IDS.secretary, scheduled_at: null, due_at: daysFromNow(0.3),  location: null, created_by: PROFILE_IDS.admin },
  ]);
}

// ── Step 29: Workflows / AI suggestions ───────────────────────────────────────

async function seedWorkflows() {
  console.log('Upserting ai_suggestions (if table exists)...');
  await upsertIgnore('ai_suggestions', [
    {
      id: 'a4100000-0000-0000-0000-100000000001',
      tenant_id: CHURCH_ID,
      workflow_code: 'first_time_visitor_follow_up',
      entity_type: 'account_request',
      entity_id: 'a3100000-0000-0000-0000-100000000001',
      title: 'Follow up with Talia Grant within 48 hours',
      summary: 'Talia submitted a portal request 1 day ago. Research shows response within 48 hours increases first-time retention by 60%.',
      confidence_score: 0.87,
      urgency: 'high',
      explanation_json: { trigger: 'new_account_request', hours_since_submission: 24 },
      boundary_note: 'Contact only through official church channels. Respect any opt-out.',
      status: 'suggested',
      created_at: daysFromNow(-1),
    },
    {
      id: 'a4100000-0000-0000-0000-100000000002',
      tenant_id: CHURCH_ID,
      workflow_code: 'volunteer_fatigue',
      entity_type: 'profile',
      entity_id: PROFILE_IDS.member,
      title: 'Resolve Greeter coverage before Thursday',
      summary: 'Service plan has one unconfirmed position. Consider sending David Chen a direct reminder or recruiting from the Young Adults group.',
      confidence_score: 0.72,
      urgency: 'medium',
      explanation_json: { trigger: 'unconfirmed_assignment', days_until_service: 7 },
      boundary_note: 'Do not pressure volunteers. Frame as a gentle reminder.',
      status: 'suggested',
      created_at: daysFromNow(-0.5),
    },
  ]);

  console.log('Upserting workflows...');
  await upsertIgnore('workflows', [
    {
      id: 'cf100000-0000-0000-0000-100000000001',
      tenant_id: CHURCH_ID,
      suggestion_id: 'a4100000-0000-0000-0000-100000000001',
      workflow_type: 'ministry',
      assigned_to_user_id: PROFILE_IDS.secretary,
      status: 'open',
      created_at: daysFromNow(-1),
    },
    {
      id: 'cf100000-0000-0000-0000-100000000002',
      tenant_id: CHURCH_ID,
      suggestion_id: 'a4100000-0000-0000-0000-100000000002',
      workflow_type: 'ministry',
      assigned_to_user_id: PROFILE_IDS.leader,
      status: 'open',
      created_at: daysFromNow(-0.5),
    },
  ]);

}

// ── Step 30: Profile sensitive fields ─────────────────────────────────────────

async function seedProfileSensitiveFields() {
  console.log('Upserting profile_sensitive_fields...');
  // Some profiles intentionally missing emergency contact — triggers people readiness
  await upsert('profile_sensitive_fields', [
    { profile_id: PROFILE_IDS.admin,  church_id: CHURCH_ID, emergency_contact_name: 'Aaron Mitchell',  emergency_contact_phone: '555-2101' },
    { profile_id: PROFILE_IDS.member, church_id: CHURCH_ID, emergency_contact_name: 'Mei Chen',        emergency_contact_phone: '555-2102' },
    { profile_id: PROFILE_IDS.leader, church_id: CHURCH_ID, emergency_contact_name: 'Denise James',    emergency_contact_phone: '555-2105' },
    { profile_id: PROFILE_IDS.linda,  church_id: CHURCH_ID, emergency_contact_name: 'Paul Nguyen',     emergency_contact_phone: '555-2107' },
    // elena and noah intentionally missing — triggers incompleteProfiles readiness metric
  ], 'profile_id');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  console.log('');
  console.log('ChurchCore Demo Seed');
  console.log('===================');
  console.log(`Target:  ${SUPABASE_URL}`);
  console.log(`Church:  Grace Harbor Church (${CHURCH_ID})`);
  console.log('');

  let authIds = {};
  try {
    authIds = await seedAuthUsers();
  } catch (err) {
    console.error(`AUTH USER CREATION FAILED: ${err.message}`);
    console.error('Continuing with data seed using null user_ids...');
  }

  await deleteAutoCreatedProfiles();
  await seedChurch();
  await seedFamilies();
  await seedProfiles(authIds);
  await seedChurchMemberships(authIds);
  await seedChurchSettings();
  await seedMinistries();
  await seedProfileMinistries();
  await seedProfileSensitiveFields();
  await seedEvents();
  await seedEventRegistrationSettings();
  await seedEventRegistrations();
  await seedEventRosters();
  await seedAttendance();
  await seedCCM();
  await deleteFinanceData();
  await seedFinanceAccounts();
  await seedGivingFundAccounts();
  await seedPublicGivingPage();
  await seedDonations();
  await seedFinanceJournals();
  await seedFinanceJournalLines();
  await seedFinanceBudget();
  await seedGroups();
  await seedGroupMembers();
  await seedServicePlans();
  await seedCommunications();
  await seedAccountRequests();
  await seedCareAssignments();
  await seedDailyWorkItems();
  await seedWorkflows();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('');
  console.log('Seed summary');
  console.log('============');
  const tableWidth = Math.max(...Object.keys(counts).map(k => k.length), 12);
  for (const [table, n] of Object.entries(counts).sort()) {
    console.log(`  ${table.padEnd(tableWidth)}  ${n}`);
  }
  console.log('');
  console.log(`Completed in ${elapsed}s`);
  console.log('');
  console.log('Demo credentials');
  console.log('----------------');
  console.log('  admin@graceharbor.church    ChurchCoreDemo2026!  (church_admin)');
  console.log('  member@graceharbor.church   ChurchCoreDemo2026!  (member_volunteer)');
  console.log('  secretary@graceharbor.church ChurchCoreDemo2026!  (secretary)');
  console.log('  pastor@graceharbor.church   ChurchCoreDemo2026!  (pastor_elder)');
  console.log('  leader@graceharbor.church   ChurchCoreDemo2026!  (ministry_leader)');
  console.log('');
  console.log('Public giving page:  /give/grace-harbor');
  console.log('Paid event (banquet): Register from member portal → "Complete Demo Payment — $35.00"');
  console.log('');
}

main().catch(err => {
  console.error('');
  console.error('FATAL:', err.stack ?? err.message);
  console.error('');
  process.exit(1);
});
