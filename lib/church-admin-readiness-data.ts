import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import {
  createReadinessSummary,
  readinessCompletionStateFor,
  readinessSeverityFor,
  readinessStatusFor,
  type ReadinessSummary,
} from "@/lib/readiness-contract";
import {
  buildAccountRequestsReadinessSummary,
  buildChurchSetupReadinessSummary,
  buildEventReadinessSummary,
  buildPeopleReadinessSummary,
  buildVolunteerReadinessSummary,
} from "@/lib/church-admin-readiness-modules";

export type { ReadinessStatus } from "@/lib/readiness-contract";

export type ChurchAdminReadinessItem = ReadinessSummary;

export type ChurchAdminReadinessData = {
  source: "preview" | "live";
  readyCount: number;
  attentionCount: number;
  blockedCount: number;
  items: ChurchAdminReadinessItem[];
};

type ReadinessMetricRow = {
  missing_settings: number;
  pending_account_requests: number;
  incomplete_profiles: number;
  unassigned_households: number;
  upcoming_events: number;
  events_without_roster: number;
  open_ccm_services: number;
  ccm_volunteers: number;
  ccm_followups: number;
  open_volunteer_shifts: number;
  unassigned_volunteer_shifts: number;
  failed_donations: number;
  unposted_donations: number;
  draft_journals: number;
  live_giving_pages: number;
  open_workflows: number;
};

const previewItems: ChurchAdminReadinessItem[] = [
  createReadinessSummary({
    id: "church-setup",
    module: "setup",
    title: "Church setup",
    description: "Confirm tenant profile, contact, website, address, and public summary.",
    status: "attention",
    severity: "notice",
    issueCount: 1,
    completionState: "unavailable",
    recommendedAction: "Configure a tenant backend, then complete church profile settings.",
    target: { route: "/app/church-admin/settings" },
    detail: "Preview mode cannot verify live tenant settings.",
  }),
  createReadinessSummary({
    id: "portal-requests",
    module: "accounts",
    title: "Portal account requests",
    description: "Approve or reject member portal access requests.",
    status: "attention",
    severity: "notice",
    issueCount: 1,
    completionState: "unavailable",
    recommendedAction: "Configure a tenant backend, then review pending portal account requests.",
    target: { route: "/app/church-admin/accounts", query: { status: "pending" } },
    detail: "Use the account queue once a tenant backend is configured.",
  }),
  createReadinessSummary({
    id: "people-households",
    module: "people",
    title: "People and households",
    description: "Resolve incomplete profiles and unassigned household records.",
    status: "attention",
    severity: "notice",
    issueCount: 1,
    completionState: "unavailable",
    recommendedAction: "Configure a tenant backend, then review incomplete people records.",
    target: { route: "/app/church-admin/people", query: { view: "incomplete-profiles" } },
    detail: "Preview mode does not verify live profile completeness.",
  }),
  createReadinessSummary({
    id: "weekend-events",
    module: "events",
    title: "Weekend events",
    description: "Review upcoming events, rosters, capacity, and check-in readiness.",
    status: "attention",
    severity: "notice",
    issueCount: 1,
    completionState: "unavailable",
    recommendedAction: "Configure a tenant backend, then review upcoming event readiness.",
    target: { route: "/app/church-admin/events", query: { view: "needs-roster" } },
    detail: "Use event records after local or hosted tenant data is configured.",
  }),
  createReadinessSummary({
    id: "children-ministry",
    module: "children",
    title: "Children's ministry",
    description: "Check service state, volunteer coverage, and follow-up incidents.",
    status: "attention",
    severity: "notice",
    issueCount: 1,
    completionState: "unavailable",
    recommendedAction: "Configure a tenant backend, then review children's ministry safety readiness.",
    target: { route: "/app/church-admin/children/dashboard", query: { view: "readiness" } },
    detail: "Preview mode cannot confirm live child-safety readiness.",
  }),
  createReadinessSummary({
    id: "volunteer-schedule",
    module: "volunteers",
    title: "Volunteer schedule",
    description: "Review open and unassigned volunteer shifts.",
    status: "attention",
    severity: "notice",
    issueCount: 1,
    completionState: "unavailable",
    recommendedAction: "Configure a tenant backend, then review volunteer schedule coverage.",
    target: { route: "/app/church-admin/volunteers/schedules", query: { view: "unassigned" } },
    detail: "Volunteer coverage requires tenant data.",
  }),
  createReadinessSummary({
    id: "giving-finance",
    module: "money",
    title: "Giving and finance",
    description: "Review failed gifts, GL posting gaps, giving page status, and draft journals.",
    status: "attention",
    severity: "notice",
    issueCount: 1,
    completionState: "unavailable",
    recommendedAction: "Configure a tenant backend, then review giving and finance exceptions.",
    target: { route: "/app/church-admin/giving", query: { view: "exceptions" } },
    detail: "Financial readiness requires tenant data.",
  }),
  createReadinessSummary({
    id: "suggested-workflows",
    module: "workflows",
    title: "Suggested ministry workflows",
    description: "Triage open ministry suggestions and follow-up workflows.",
    status: "attention",
    severity: "notice",
    issueCount: 1,
    completionState: "unavailable",
    recommendedAction: "Configure a tenant backend, then review suggested ministry workflows.",
    target: { route: "/app/church-admin/workflows", query: { status: "open" } },
    detail: "Workflow signals require tenant data.",
  }),
];

function summarize(items: ChurchAdminReadinessItem[], source: ChurchAdminReadinessData["source"]) {
  return {
    source,
    readyCount: items.filter((item) => item.status === "ready").length,
    attentionCount: items.filter((item) => item.status === "attention").length,
    blockedCount: items.filter((item) => item.status === "blocked").length,
    items,
  } satisfies ChurchAdminReadinessData;
}

export function buildChurchAdminReadinessItems(row: ReadinessMetricRow): ChurchAdminReadinessItem[] {
  const childrenIssueCount =
    (row.open_ccm_services === 0 ? 1 : 0) + row.ccm_followups + (row.open_ccm_services > 0 && row.ccm_volunteers === 0 ? 1 : 0);
  const childrenStatus = readinessStatusFor(
    row.open_ccm_services > 0 && row.ccm_volunteers === 0,
    row.ccm_followups > 0 || row.open_ccm_services === 0,
  );
  const givingIssueCount =
    row.failed_donations + row.unposted_donations + row.draft_journals + (row.live_giving_pages === 0 ? 1 : 0);
  const givingStatus = readinessStatusFor(
    row.live_giving_pages === 0 || row.failed_donations > 0,
    row.unposted_donations > 0 || row.draft_journals > 0,
  );
  const workflowStatus = readinessStatusFor(row.open_workflows > 10, row.open_workflows > 0);

  return [
    buildChurchSetupReadinessSummary({ missingSettings: row.missing_settings }),
    buildAccountRequestsReadinessSummary({ pendingAccountRequests: row.pending_account_requests }),
    buildPeopleReadinessSummary({
      incompleteProfiles: row.incomplete_profiles,
      unassignedHouseholds: row.unassigned_households,
    }),
    buildEventReadinessSummary({
      upcomingEvents: row.upcoming_events,
      eventsWithoutRoster: row.events_without_roster,
    }),
    createReadinessSummary({
      id: "children-ministry",
      module: "children",
      title: "Children's ministry",
      description: "Check service state, volunteer coverage, and follow-up incidents.",
      status: childrenStatus,
      severity: readinessSeverityFor(childrenStatus, childrenIssueCount),
      issueCount: childrenIssueCount,
      completionState: readinessCompletionStateFor(childrenStatus),
      recommendedAction:
        childrenIssueCount === 0
          ? "No action needed."
          : "Open the children's ministry readiness dashboard and resolve service, volunteer, or incident gaps.",
      target: { route: "/app/church-admin/children/dashboard", query: { view: "readiness" } },
      detail:
        row.open_ccm_services > 0
          ? `${row.open_ccm_services} open service${row.open_ccm_services === 1 ? "" : "s"} · ${row.ccm_volunteers} volunteer assignment${row.ccm_volunteers === 1 ? "" : "s"} · ${row.ccm_followups} follow-up incident${row.ccm_followups === 1 ? "" : "s"}.`
          : "No open children's ministry service is ready for check-in.",
    }),
    buildVolunteerReadinessSummary({
      openVolunteerShifts: row.open_volunteer_shifts,
      unassignedVolunteerShifts: row.unassigned_volunteer_shifts,
    }),
    createReadinessSummary({
      id: "giving-finance",
      module: "money",
      title: "Giving and finance",
      description: "Review failed gifts, GL posting gaps, giving page status, and draft journals.",
      status: givingStatus,
      severity: readinessSeverityFor(givingStatus, givingIssueCount),
      issueCount: givingIssueCount,
      completionState: readinessCompletionStateFor(givingStatus),
      recommendedAction:
        givingIssueCount === 0
          ? "No action needed."
          : "Open giving and finance exceptions to resolve failed gifts, GL posting gaps, draft journals, or giving page setup.",
      target: { route: "/app/church-admin/giving", query: { view: "exceptions" } },
      detail: `${row.failed_donations} failed gift${row.failed_donations === 1 ? "" : "s"} · ${row.unposted_donations} unposted gift${row.unposted_donations === 1 ? "" : "s"} · ${row.draft_journals} draft journal${row.draft_journals === 1 ? "" : "s"} · ${row.live_giving_pages} live giving page${row.live_giving_pages === 1 ? "" : "s"}.`,
    }),
    createReadinessSummary({
      id: "suggested-workflows",
      module: "workflows",
      title: "Suggested ministry workflows",
      description: "Triage open ministry suggestions and follow-up workflows.",
      status: workflowStatus,
      severity: readinessSeverityFor(workflowStatus, row.open_workflows),
      issueCount: row.open_workflows,
      completionState: readinessCompletionStateFor(workflowStatus),
      recommendedAction:
        row.open_workflows === 0
          ? "No action needed."
          : "Open suggested workflows and triage open or assigned ministry actions.",
      target: { route: "/app/church-admin/workflows", query: { status: "open" } },
      detail:
        row.open_workflows === 0
          ? "No open suggested workflows."
          : `${row.open_workflows} open suggested workflow${row.open_workflows === 1 ? "" : "s"}.`,
    }),
  ];
}

export async function getChurchAdminReadinessData(
  session: ChurchAppSession,
): Promise<ChurchAdminReadinessData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return summarize(previewItems, "preview");
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<ReadinessMetricRow>(
      `
        with
          church_setup as (
            select (
              (case when coalesce(legal_name, '') = '' then 1 else 0 end) +
              (case when coalesce(contact_email, '') = '' and coalesce(contact_phone, '') = '' then 1 else 0 end) +
              (case when coalesce(website_url, '') = '' then 1 else 0 end) +
              (case when coalesce(mailing_address, '') = '' then 1 else 0 end) +
              (case when coalesce(public_summary, '') = '' then 1 else 0 end)
            )::int as missing_settings
            from public.churches
            where id = $1
          ),
          account_summary as (
            select count(*)::int as pending_account_requests
            from public.account_requests
            where church_id = $1 and status = 'pending'
          ),
          people_summary as (
            select
              count(*) filter (
                where coalesce(full_name, '') = ''
                   or email is null
                   or phone is null
                   or address is null
              )::int as incomplete_profiles,
              count(*) filter (
                where family_id is null
                  and coalesce(membership_status, 'active') in ('active', 'visitor', 'baptized')
              )::int as unassigned_households
            from public.profiles
            where church_id = $1
              and merged_at is null
          ),
          event_summary as (
            select
              count(*)::int as upcoming_events,
              count(*) filter (
                where not exists (
                  select 1
                  from public.event_rosters roster
                  where roster.event_id = event.id
                    and roster.church_id = event.church_id
                )
              )::int as events_without_roster
            from public.events event
            where event.church_id = $1
              and event.starts_at >= timezone('utc', now())
              and event.starts_at < timezone('utc', now()) + interval '14 days'
          ),
          ccm_summary as (
            select
              count(*) filter (where service.status = 'open')::int as open_ccm_services,
              coalesce((
                select count(*)::int
                from public.ccm_volunteer_assignments assignment
                join public.ccm_services open_service
                  on open_service.id = assignment.service_id
                 and open_service.church_id = assignment.church_id
                where assignment.church_id = $1
                  and open_service.status = 'open'
              ), 0) as ccm_volunteers,
              coalesce((
                select count(*)::int
                from public.ccm_incidents incident
                where incident.church_id = $1
                  and incident.follow_up_required
              ), 0) as ccm_followups
            from public.ccm_services service
            where service.church_id = $1
              and service.service_date >= current_date - interval '1 day'
          ),
          volunteer_summary as (
            select
              count(*) filter (where status::text in ('open', 'assigned'))::int as open_volunteer_shifts,
              count(*) filter (
                where assigned_user_id is null
                  and starts_at >= timezone('utc', now())
                  and starts_at < timezone('utc', now()) + interval '14 days'
              )::int as unassigned_volunteer_shifts
            from public.volunteer_shifts
            where church_id = $1
          ),
          giving_summary as (
            select
              count(*) filter (where status = 'failed')::int as failed_donations,
              count(*) filter (
                where status = 'succeeded'
                  and not exists (
                    select 1
                    from public.donation_gl_posts post
                    where post.donation_id = donation.id
                      and post.church_id = donation.church_id
                      and post.status = 'posted'
                  )
              )::int as unposted_donations
            from public.donations donation
            where donation.church_id = $1
              and donation.created_at >= timezone('utc', now()) - interval '30 days'
          ),
          finance_summary as (
            select count(*) filter (where status = 'draft')::int as draft_journals
            from public.finance_journals
            where church_id = $1
          ),
          giving_page_summary as (
            select count(*) filter (where is_live)::int as live_giving_pages
            from public.public_giving_pages
            where church_id = $1
          ),
          workflow_summary as (
            select count(*) filter (where status in ('open', 'assigned'))::int as open_workflows
            from public.workflows
            where tenant_id = $1
          )
        select *
        from church_setup,
             account_summary,
             people_summary,
             event_summary,
             ccm_summary,
             volunteer_summary,
             giving_summary,
             finance_summary,
             giving_page_summary,
             workflow_summary
      `,
      [churchId],
    );

    const row = result.rows[0];
    return row ? summarize(buildChurchAdminReadinessItems(row), "live") : summarize(previewItems, "preview");
  }

  const supabase = await createTenantServerClient();
  const now = new Date();
  const next14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    churchResult,
    accountResult,
    profilesResult,
    eventsResult,
    rostersResult,
    servicesResult,
    ccmVolunteersResult,
    incidentsResult,
    shiftsResult,
    donationsResult,
    glPostsResult,
    journalsResult,
    givingPagesResult,
    workflowsResult,
  ] = await Promise.all([
    supabase
      .from("churches")
      .select("legal_name, contact_email, contact_phone, website_url, mailing_address, public_summary")
      .eq("id", churchId)
      .maybeSingle(),
    supabase
      .from("account_requests")
      .select("id, status")
      .eq("church_id", churchId)
      .eq("status", "pending"),
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, address, family_id, membership_status")
      .eq("church_id", churchId)
      .is("merged_at", null),
    supabase
      .from("events")
      .select("id, starts_at")
      .eq("church_id", churchId)
      .gte("starts_at", now.toISOString())
      .lt("starts_at", next14.toISOString()),
    supabase.from("event_rosters").select("event_id").eq("church_id", churchId),
    supabase
      .from("ccm_services")
      .select("id, status, service_date")
      .eq("church_id", churchId)
      .gte("service_date", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),
    supabase.from("ccm_volunteer_assignments").select("service_id").eq("church_id", churchId),
    supabase
      .from("ccm_incidents")
      .select("id, follow_up_required")
      .eq("church_id", churchId)
      .eq("follow_up_required", true),
    supabase
      .from("volunteer_shifts")
      .select("id, status, assigned_user_id, starts_at")
      .eq("church_id", churchId),
    supabase
      .from("donations")
      .select("id, status, created_at")
      .eq("church_id", churchId)
      .gte("created_at", last30.toISOString()),
    supabase.from("donation_gl_posts").select("donation_id, status").eq("church_id", churchId),
    supabase.from("finance_journals").select("id, status").eq("church_id", churchId),
    supabase.from("public_giving_pages").select("id, is_live").eq("church_id", churchId),
    supabase.from("workflows").select("id, status").eq("tenant_id", churchId),
  ]);

  const church = churchResult.data;
  const profiles = profilesResult.data ?? [];
  const events = eventsResult.data ?? [];
  const rosterEventIds = new Set((rostersResult.data ?? []).map((row) => row.event_id));
  const services = servicesResult.data ?? [];
  const openServiceIds = new Set(services.filter((service) => service.status === "open").map((service) => service.id));
  const ccmVolunteers = (ccmVolunteersResult.data ?? []).filter((assignment) =>
    openServiceIds.has(assignment.service_id),
  );
  const shifts = shiftsResult.data ?? [];
  const donations = donationsResult.data ?? [];
  const postedDonationIds = new Set(
    (glPostsResult.data ?? [])
      .filter((post) => post.status === "posted")
      .map((post) => post.donation_id),
  );

  const missingSettings =
    church
      ? [
          church.legal_name,
          church.contact_email || church.contact_phone,
          church.website_url,
          church.mailing_address,
          church.public_summary,
        ].filter((value) => !value).length
      : 5;

  return summarize(
    buildChurchAdminReadinessItems({
      missing_settings: missingSettings,
      pending_account_requests: accountResult.data?.length ?? 0,
      incomplete_profiles: profiles.filter(
        (profile) => !profile.full_name || !profile.email || !profile.phone || !profile.address,
      ).length,
      unassigned_households: profiles.filter(
        (profile) =>
          !profile.family_id &&
          ["active", "visitor", "baptized"].includes(profile.membership_status ?? "active"),
      ).length,
      upcoming_events: events.length,
      events_without_roster: events.filter((event) => !rosterEventIds.has(event.id)).length,
      open_ccm_services: openServiceIds.size,
      ccm_volunteers: ccmVolunteers.length,
      ccm_followups: incidentsResult.data?.length ?? 0,
      open_volunteer_shifts: shifts.filter((shift) => ["open", "assigned"].includes(shift.status)).length,
      unassigned_volunteer_shifts: shifts.filter((shift) => {
        const startsAt = new Date(shift.starts_at).getTime();
        return !shift.assigned_user_id && startsAt >= now.getTime() && startsAt < next14.getTime();
      }).length,
      failed_donations: donations.filter((donation) => donation.status === "failed").length,
      unposted_donations: donations.filter(
        (donation) => donation.status === "succeeded" && !postedDonationIds.has(donation.id),
      ).length,
      draft_journals: (journalsResult.data ?? []).filter((journal) => journal.status === "draft").length,
      live_giving_pages: (givingPagesResult.data ?? []).filter((page) => page.is_live).length,
      open_workflows: (workflowsResult.data ?? []).filter((workflow) =>
        ["open", "assigned"].includes(workflow.status),
      ).length,
    }),
    "live",
  );
}
