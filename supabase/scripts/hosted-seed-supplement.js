const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.TENANT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.TENANT_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing env vars. Set TENANT_SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and TENANT_SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY).');
  process.exit(1);
}

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const churchId = '11111111-0000-0000-0000-000000000001';
const ministryIds = {
  worship: '44444444-0000-0000-0000-000000000001',
  outreach: '44444444-0000-0000-0000-000000000006',
  children: '44444444-0000-0000-0000-000000000007',
};
const profileIds = {
  james: '22222222-0000-0000-0000-000000000003',
  aisha: '22222222-0000-0000-0000-000000000004',
  robert: '22222222-0000-0000-0000-000000000005',
  marcus: '22222222-0000-0000-0000-000000000006',
  grace: '22222222-0000-0000-0000-000000000008',
};

async function upsert(table, rows, onConflict = 'id') {
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`${table}: ${error.message}`);
}

(async () => {
  const { data: seededProfiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id,email')
    .in('email', ['sarah@churchcoreops.app', 'david.member@graceharbor.church']);
  if (profilesError) throw profilesError;

  const byEmail = Object.fromEntries((seededProfiles || []).map((r) => [r.email, r.id]));
  const sarahId = byEmail['sarah@churchcoreops.app'];
  const davidId = byEmail['david.member@graceharbor.church'];
  if (!sarahId || !davidId) throw new Error('Hosted demo profiles missing after rich seed.');

  const eventIds = {
    worship: '61111111-0000-0000-0000-000000000001',
    outreach: '61111111-0000-0000-0000-000000000002',
    orientation: '61111111-0000-0000-0000-000000000003',
    parenting: '61111111-0000-0000-0000-000000000004',
  };
  const groupIds = {
    men: '62222222-0000-0000-0000-000000000001',
    youngAdults: '62222222-0000-0000-0000-000000000002',
  };
  const meetingIds = {
    men: '63333333-0000-0000-0000-000000000001',
    youngAdults: '63333333-0000-0000-0000-000000000002',
  };

  const finance = {
    cash: '64444444-0000-0000-0000-000000000001',
    donationsIncome: '64444444-0000-0000-0000-000000000002',
    missionsExpense: '64444444-0000-0000-0000-000000000003',
    childrenExpense: '64444444-0000-0000-0000-000000000004',
    retainedEarnings: '64444444-0000-0000-0000-000000000005',
    journal: '65555555-0000-0000-0000-000000000001',
    budget: '66666666-0000-0000-0000-000000000001',
    importJob: '67777777-0000-0000-0000-000000000001',
    givingGeneral: '68888888-0000-0000-0000-000000000001',
    givingMissions: '68888888-0000-0000-0000-000000000002',
    page: '69999999-0000-0000-0000-000000000001',
    donation1: '6aaaaaaa-0000-0000-0000-000000000001',
    donation2: '6aaaaaaa-0000-0000-0000-000000000002',
  };

  await upsert('events', [
    {
      id: eventIds.worship,
      church_id: churchId,
      ministry_id: ministryIds.worship,
      created_by: sarahId,
      title: 'Sunday Worship Service',
      description: 'Full church worship service with prayer, Scripture, and communion.',
      location: 'Main Sanctuary',
      starts_at: '2026-04-19T14:00:00.000Z',
      ends_at: '2026-04-19T15:30:00.000Z',
      category: 'worship',
      visibility: 'members',
      rsvp_enabled: true,
      capacity: 250,
      approval_status: 'approved',
    },
    {
      id: eventIds.outreach,
      church_id: churchId,
      ministry_id: ministryIds.outreach,
      created_by: sarahId,
      title: 'Serve Saturday Food Distribution',
      description: 'Community food distribution and prayer outreach.',
      location: 'Community Center Parking Lot',
      starts_at: '2026-04-25T13:00:00.000Z',
      ends_at: '2026-04-25T16:00:00.000Z',
      category: 'outreach',
      visibility: 'members',
      rsvp_enabled: true,
      capacity: 80,
      approval_status: 'approved',
    },
    {
      id: eventIds.orientation,
      church_id: churchId,
      ministry_id: ministryIds.worship,
      created_by: sarahId,
      title: 'Volunteer Orientation Night',
      description: 'New volunteer onboarding for worship, children, and outreach teams.',
      location: 'Fellowship Hall',
      starts_at: '2026-04-28T23:00:00.000Z',
      ends_at: '2026-04-29T00:30:00.000Z',
      category: 'administrative',
      visibility: 'members',
      rsvp_enabled: true,
      capacity: 40,
      approval_status: 'approved',
    },
    {
      id: eventIds.parenting,
      church_id: churchId,
      ministry_id: ministryIds.children,
      created_by: sarahId,
      title: 'Parenting Through the Psalms',
      description: 'A one-night equipping session for families and children ministry volunteers.',
      location: 'Room C12',
      starts_at: '2026-05-01T23:00:00.000Z',
      ends_at: '2026-05-02T00:30:00.000Z',
      category: 'ministry',
      visibility: 'members',
      rsvp_enabled: true,
      capacity: 35,
      approval_status: 'approved',
    },
  ]);

  await upsert('event_rsvps', [
    { id: '71111111-0000-0000-0000-000000000001', event_id: eventIds.outreach, user_id: davidId, status: 'yes', note: 'Available for setup and prayer tent.' },
    { id: '71111111-0000-0000-0000-000000000002', event_id: eventIds.outreach, user_id: profileIds.aisha, status: 'yes', note: 'Can help with family registration.' },
    { id: '71111111-0000-0000-0000-000000000003', event_id: eventIds.orientation, user_id: profileIds.james, status: 'maybe', note: 'Will confirm after rehearsal schedule is finalized.' },
  ]);

  await upsert('attendance', [
    { id: '72222222-0000-0000-0000-000000000001', profile_id: sarahId, event_id: eventIds.worship, checked_in_at: '2026-04-19T13:52:00.000Z', status: 'present' },
    { id: '72222222-0000-0000-0000-000000000002', profile_id: davidId, event_id: eventIds.worship, checked_in_at: '2026-04-19T13:55:00.000Z', status: 'present' },
    { id: '72222222-0000-0000-0000-000000000003', profile_id: profileIds.james, event_id: eventIds.worship, checked_in_at: '2026-04-19T13:50:00.000Z', status: 'present' },
    { id: '72222222-0000-0000-0000-000000000004', profile_id: profileIds.aisha, event_id: eventIds.worship, checked_in_at: '2026-04-19T13:58:00.000Z', status: 'present' },
    { id: '72222222-0000-0000-0000-000000000005', profile_id: profileIds.robert, event_id: eventIds.worship, checked_in_at: '2026-04-19T13:49:00.000Z', status: 'present' },
    { id: '72222222-0000-0000-0000-000000000006', profile_id: profileIds.grace, event_id: eventIds.worship, checked_in_at: '2026-04-19T14:01:00.000Z', status: 'excused' },
  ]);

  await upsert('service_attendance', [
    { id: '73333333-0000-0000-0000-000000000001', church_id: churchId, service_date: '2026-04-05', service_type: 'sunday_morning', headcount: 184, created_by: sarahId, notes: 'Palm Sunday bump with first-time households.' },
    { id: '73333333-0000-0000-0000-000000000002', church_id: churchId, service_date: '2026-04-12', service_type: 'sunday_morning', headcount: 198, created_by: sarahId, notes: 'Easter prep volunteer commissioning.' },
    { id: '73333333-0000-0000-0000-000000000003', church_id: churchId, service_date: '2026-04-19', service_type: 'sunday_morning', headcount: 212, created_by: sarahId, notes: 'Follow-up Sunday after outreach push.' },
  ]);

  await upsert('volunteer_profiles', [
    { id: '74444444-0000-0000-0000-000000000001', church_id: churchId, user_id: davidId, skills: ['hospitality', 'setup'], availability: { saturday: ['morning'] }, training: { orientation: true, safety: true } },
    { id: '74444444-0000-0000-0000-000000000002', church_id: churchId, user_id: profileIds.james, skills: ['audio', 'guitar', 'stage_manager'], availability: { sunday: ['morning'], wednesday: ['evening'] }, training: { worship: true } },
    { id: '74444444-0000-0000-0000-000000000003', church_id: churchId, user_id: profileIds.aisha, skills: ['checkin', 'hospitality', 'communications'], availability: { saturday: ['morning'], sunday: ['morning'] }, training: { children: true, backgroundCheck: true } },
  ]);

  await upsert('volunteer_shifts', [
    { id: '75555555-0000-0000-0000-000000000001', church_id: churchId, event_id: eventIds.outreach, ministry_id: ministryIds.outreach, assigned_user_id: davidId, title: 'Setup Crew Lead', starts_at: '2026-04-25T12:00:00.000Z', ends_at: '2026-04-25T13:30:00.000Z', status: 'confirmed' },
    { id: '75555555-0000-0000-0000-000000000002', church_id: churchId, event_id: eventIds.outreach, ministry_id: ministryIds.outreach, assigned_user_id: profileIds.aisha, title: 'Guest Registration', starts_at: '2026-04-25T12:45:00.000Z', ends_at: '2026-04-25T16:00:00.000Z', status: 'assigned' },
    { id: '75555555-0000-0000-0000-000000000003', church_id: churchId, event_id: eventIds.orientation, ministry_id: ministryIds.worship, assigned_user_id: profileIds.james, title: 'Worship Tech Overview', starts_at: '2026-04-28T23:15:00.000Z', ends_at: '2026-04-29T00:15:00.000Z', status: 'confirmed' },
  ]);

  await upsert('groups', [
    { id: groupIds.men, church_id: churchId, name: 'Iron Sharpens Iron', description: 'Men\'s weekly discipleship and prayer group.', category: 'discipleship', leader_profile_id: profileIds.robert, meeting_day: 'Tuesday', meeting_time: '7:00 PM', meeting_location: 'Room B4', capacity: 16, is_open: true, is_active: true },
    { id: groupIds.youngAdults, church_id: churchId, name: 'Young Adults Table', description: 'Faith, work, and calling conversations for young adults.', category: 'life_stage', leader_profile_id: profileIds.grace, meeting_day: 'Thursday', meeting_time: '6:30 PM', meeting_location: 'Coffee Loft', capacity: 18, is_open: true, is_active: true },
  ]);

  await upsert('group_members', [
    { id: '76666666-0000-0000-0000-000000000001', group_id: groupIds.men, church_id: churchId, profile_id: profileIds.robert, role: 'leader', status: 'active' },
    { id: '76666666-0000-0000-0000-000000000002', group_id: groupIds.men, church_id: churchId, profile_id: davidId, role: 'member', status: 'active' },
    { id: '76666666-0000-0000-0000-000000000003', group_id: groupIds.men, church_id: churchId, profile_id: profileIds.marcus, role: 'co_leader', status: 'active' },
    { id: '76666666-0000-0000-0000-000000000004', group_id: groupIds.youngAdults, church_id: churchId, profile_id: profileIds.grace, role: 'leader', status: 'active' },
    { id: '76666666-0000-0000-0000-000000000005', group_id: groupIds.youngAdults, church_id: churchId, profile_id: profileIds.aisha, role: 'member', status: 'active' },
    { id: '76666666-0000-0000-0000-000000000006', group_id: groupIds.youngAdults, church_id: churchId, profile_id: profileIds.james, role: 'member', status: 'active' },
  ]);

  await upsert('group_meetings', [
    { id: meetingIds.men, group_id: groupIds.men, church_id: churchId, scheduled_at: '2026-04-15T23:00:00.000Z', location: 'Room B4', notes: 'Proverbs 27 study and prayer triads.', created_by: profileIds.robert },
    { id: meetingIds.youngAdults, group_id: groupIds.youngAdults, church_id: churchId, scheduled_at: '2026-04-17T22:30:00.000Z', location: 'Coffee Loft', notes: 'Calling, work, and Sabbath rhythms.', created_by: profileIds.grace },
  ]);

  await upsert('group_attendance', [
    { id: '77777777-0000-0000-0000-000000000001', meeting_id: meetingIds.men, group_id: groupIds.men, church_id: churchId, profile_id: profileIds.robert, status: 'present' },
    { id: '77777777-0000-0000-0000-000000000002', meeting_id: meetingIds.men, group_id: groupIds.men, church_id: churchId, profile_id: davidId, status: 'present' },
    { id: '77777777-0000-0000-0000-000000000003', meeting_id: meetingIds.men, group_id: groupIds.men, church_id: churchId, profile_id: profileIds.marcus, status: 'excused' },
    { id: '77777777-0000-0000-0000-000000000004', meeting_id: meetingIds.youngAdults, group_id: groupIds.youngAdults, church_id: churchId, profile_id: profileIds.grace, status: 'present' },
    { id: '77777777-0000-0000-0000-000000000005', meeting_id: meetingIds.youngAdults, group_id: groupIds.youngAdults, church_id: churchId, profile_id: profileIds.aisha, status: 'present' },
    { id: '77777777-0000-0000-0000-000000000006', meeting_id: meetingIds.youngAdults, group_id: groupIds.youngAdults, church_id: churchId, profile_id: profileIds.james, status: 'present' },
  ]);

  await upsert('group_resources', [
    { id: '78888888-0000-0000-0000-000000000001', group_id: groupIds.men, church_id: churchId, title: 'Week 4 Proverbs Discussion Guide', url: 'https://example.org/proverbs-week-4', resource_type: 'link', added_by: profileIds.robert },
    { id: '78888888-0000-0000-0000-000000000002', group_id: groupIds.youngAdults, church_id: churchId, title: 'Sabbath Reflection Worksheet', url: 'https://example.org/sabbath-reflection', resource_type: 'file', added_by: profileIds.grace },
  ]);

  await upsert('finance_accounts', [
    { id: finance.cash, church_id: churchId, account_code: '1010', name: 'Operating Cash', account_type: 'asset', description: 'Primary operating account.', is_active: true },
    { id: finance.donationsIncome, church_id: churchId, account_code: '4010', name: 'General Tithes and Offerings', account_type: 'income', description: 'Undesignated recurring and one-time gifts.', is_active: true },
    { id: finance.missionsExpense, church_id: churchId, account_code: '6100', name: 'Missions Support', account_type: 'expense', description: 'Outbound support and trip spending.', is_active: true },
    { id: finance.childrenExpense, church_id: churchId, account_code: '6200', name: 'Children Ministry Supplies', account_type: 'expense', description: 'Curriculum and classroom supplies.', is_active: true },
    { id: finance.retainedEarnings, church_id: churchId, account_code: '3000', name: 'Retained Earnings', account_type: 'equity', description: 'Opening balance carry-forward.', is_active: true },
  ]);

  await upsert('finance_journals', [
    { id: finance.journal, church_id: churchId, journal_date: '2026-04-18', description: 'April giving batch and designated missions transfer', journal_type: 'general', status: 'posted', reference: 'APR-2026-BATCH-01', posted_by: sarahId, posted_at: '2026-04-18T21:15:00.000Z', created_by: sarahId },
  ]);

  await upsert('finance_journal_lines', [
    { id: '79999999-0000-0000-0000-000000000001', journal_id: finance.journal, church_id: churchId, account_id: finance.cash, side: 'debit', amount_cents: 185000, memo: 'Deposited online gifts', sort_order: 1 },
    { id: '79999999-0000-0000-0000-000000000002', journal_id: finance.journal, church_id: churchId, account_id: finance.donationsIncome, side: 'credit', amount_cents: 150000, memo: 'General fund receipts', sort_order: 2 },
    { id: '79999999-0000-0000-0000-000000000003', journal_id: finance.journal, church_id: churchId, account_id: finance.missionsExpense, side: 'debit', amount_cents: 35000, memo: 'Missions support', sort_order: 3 },
    { id: '79999999-0000-0000-0000-000000000004', journal_id: finance.journal, church_id: churchId, account_id: finance.cash, side: 'credit', amount_cents: 35000, memo: 'Transfer to missions partner', sort_order: 4 },
  ]);

  await upsert('finance_budgets', [
    { id: finance.budget, church_id: churchId, name: 'FY2026 Operating Budget', fiscal_year: 2026, notes: 'Working budget for ministry leads and stewardship review.', is_active: true, created_by: sarahId },
  ]);

  await upsert('finance_budget_lines', [
    { id: '7aaaaaaa-0000-0000-0000-000000000001', budget_id: finance.budget, church_id: churchId, account_id: finance.donationsIncome, amount_cents: 7200000, notes: 'Annual general giving projection' },
    { id: '7aaaaaaa-0000-0000-0000-000000000002', budget_id: finance.budget, church_id: churchId, account_id: finance.missionsExpense, amount_cents: 960000, notes: 'Global partner support and trips' },
    { id: '7aaaaaaa-0000-0000-0000-000000000003', budget_id: finance.budget, church_id: churchId, account_id: finance.childrenExpense, amount_cents: 480000, notes: 'Curriculum and family ministry supplies' },
  ]);

  await upsert('finance_imports', [
    { id: finance.importJob, church_id: churchId, filename: 'april-giving-batch.csv', format: 'csv', status: 'completed', total_rows: 14, imported_rows: 14, journal_id: finance.journal, imported_by: sarahId },
  ]);

  await upsert('giving_fund_accounts', [
    { id: finance.givingGeneral, church_id: churchId, fund_designation: 'General Fund', asset_account_id: finance.cash, income_account_id: finance.donationsIncome, is_active: true },
    { id: finance.givingMissions, church_id: churchId, fund_designation: 'Missions', asset_account_id: finance.cash, income_account_id: finance.donationsIncome, is_active: true },
  ], 'church_id,fund_designation');

  await upsert('public_giving_pages', [
    { id: finance.page, church_id: churchId, slug: 'grace-harbor-give', headline: 'Support Grace Harbor Church', description: 'Give securely to support weekly ministry, missions, and family discipleship.', funds: ['General Fund', 'Missions', 'Children Ministry'], stripe_account_id: 'acct_demo_grace_harbor', is_live: true, allow_anonymous: true },
  ], 'church_id');

  await upsert('donations', [
    { id: finance.donation1, church_id: churchId, profile_id: davidId, donor_name: 'David Chen', donor_email: 'david.member@graceharbor.church', amount_cents: 6500, currency: 'usd', fund_designation: 'General Fund', stripe_payment_intent_id: 'pi_demo_001', stripe_customer_id: 'cus_demo_001', is_recurring: false, status: 'succeeded', is_anonymous: false, receipt_sent_at: '2026-04-18T21:20:00.000Z', note: 'Monthly giving' },
    { id: finance.donation2, church_id: churchId, profile_id: null, donor_name: 'Anonymous Donor', donor_email: 'anonymous@example.org', amount_cents: 12000, currency: 'usd', fund_designation: 'Missions', stripe_payment_intent_id: 'pi_demo_002', stripe_customer_id: 'cus_demo_002', is_recurring: true, stripe_subscription_id: 'sub_demo_001', status: 'succeeded', is_anonymous: true, receipt_sent_at: '2026-04-18T21:25:00.000Z', note: 'Designated monthly support for missions' },
  ]);

  await upsert('communication_logs', [
    { id: '7bbbbbbb-0000-0000-0000-000000000001', church_id: churchId, sent_by: sarahId, recipient_id: davidId, channel: 'email', subject: 'Welcome to Serve Saturday', body_preview: 'Thanks for stepping in to lead setup this week. Please arrive by 8:00 AM for prayer and staging.', external_id: 'sendgrid-demo-001', status: 'delivered', scheduled_for: '2026-04-23T13:00:00.000Z', sent_at: '2026-04-23T13:01:00.000Z' },
    { id: '7bbbbbbb-0000-0000-0000-000000000002', church_id: churchId, sent_by: sarahId, recipient_id: profileIds.james, channel: 'sms', subject: null, body_preview: 'Reminder: volunteer orientation is next Tuesday at 7:00 PM in the Fellowship Hall.', external_id: 'twilio-demo-001', status: 'sent', scheduled_for: '2026-04-23T15:00:00.000Z', sent_at: '2026-04-23T15:00:15.000Z' },
    { id: '7bbbbbbb-0000-0000-0000-000000000003', church_id: churchId, sent_by: sarahId, recipient_id: null, channel: 'in_app', subject: 'Church-Wide Prayer Night', body_preview: 'Join us Wednesday for prayer and worship as we prepare for Serve Saturday.', external_id: null, status: 'queued', scheduled_for: '2026-04-24T16:00:00.000Z', sent_at: null },
  ]);

  await upsert('first_time_visitors', [
    { id: '7ccccccc-0000-0000-0000-000000000001', church_id: churchId, full_name: 'Olivia Parker', email: 'olivia.parker@example.org', phone: '555-0101', visit_date: '2026-04-20', referred_by: 'Instagram ad', how_did_hear: 'Social media', workflow_stage: 'new', workflow_notes: 'Interested in young adults and worship.' },
    { id: '7ccccccc-0000-0000-0000-000000000002', church_id: churchId, full_name: 'Nathan Brooks', email: 'nathan.brooks@example.org', phone: '555-0102', visit_date: '2026-04-13', referred_by: 'Friend invitation', how_did_hear: 'Friend', workflow_stage: 'day1_sent', workflow_notes: 'Family with two children, wants children ministry info.' },
  ]);

  const summaryTables = ['events', 'event_rsvps', 'attendance', 'service_attendance', 'volunteer_profiles', 'volunteer_shifts', 'groups', 'group_members', 'group_meetings', 'group_attendance', 'group_resources', 'finance_accounts', 'finance_journals', 'finance_journal_lines', 'finance_budgets', 'finance_budget_lines', 'finance_imports', 'giving_fund_accounts', 'public_giving_pages', 'donations', 'communication_logs', 'first_time_visitors'];
  const summary = [];
  for (const table of summaryTables) {
    const { count, error } = await supabase.from(table).select('*', { head: true, count: 'exact' }).eq('church_id', churchId);
    summary.push({ table, count, error: error && error.message });
  }
  console.log(JSON.stringify({ churchId, summary }, null, 2));
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
