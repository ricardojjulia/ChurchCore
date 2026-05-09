import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type ChurchAdminWeekendOperationItem = {
  id: string;
  eventId: string;
  title: string;
  detail: string;
  status: "blocked" | "in-progress" | "done";
  href: string;
  badges: string[];
};

export type ChurchAdminCareOperationItem = {
  id: string;
  title: string;
  detail: string;
  status: "blocked" | "in-progress" | "done";
  href: string;
  badges: string[];
};

export type ChurchAdminCommunicationOperationItem = {
  id: string;
  title: string;
  detail: string;
  status: "blocked" | "in-progress" | "done";
  href: string;
  badges: string[];
};

export type ChurchAdminGivingOperationItem = {
  id: string;
  title: string;
  detail: string;
  status: "blocked" | "in-progress" | "done";
  href: string;
  badges: string[];
};

export type ChurchAdminOperationsData = {
  source: "preview" | "live";
  careItems: ChurchAdminCareOperationItem[];
  weekendItems: ChurchAdminWeekendOperationItem[];
  communicationItems: ChurchAdminCommunicationOperationItem[];
  givingItems: ChurchAdminGivingOperationItem[];
};

type CareOperationRow = {
  id: string;
  profile_id: string;
  profile_name: string;
  assigned_to_name: string | null;
  summary: string;
  status: string;
  priority: string;
  due_at: string | null;
  last_contact_at: string | null;
  created_at: string;
};

type EventOperationRow = {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
  approval_status: string;
  roster_count: number;
  registration_count: number;
  waitlist_count: number;
  capacity: number | null;
  registration_open: boolean | null;
};

type CommunicationLogOperationRow = {
  id: string;
  channel: string;
  subject: string | null;
  status: string;
  scheduled_for: string | null;
  created_at: string;
};

type CommunicationGapOperationRow = {
  missing_email_count: number;
  missing_phone_count: number;
  contact_private_count: number;
  email_opt_out_count: number;
  sms_opt_out_count: number;
};

type GivingOperationRow = {
  pending_count: number;
  failed_count: number;
  unsent_receipts_count: number;
  unposted_gl_count: number;
  unmapped_fund_count: number;
  giving_page_count: number;
  live_giving_page_count: number;
};

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
  }).format(new Date(value));
}

function buildWeekendItems(rows: EventOperationRow[]): ChurchAdminWeekendOperationItem[] {
  const now = Date.now();
  const fourteenDays = 14 * 24 * 60 * 60 * 1000;

  return rows
    .flatMap((row) => {
      const startsAt = new Date(row.starts_at).getTime();
      const startsSoon = startsAt - now <= fourteenDays;
      const hasApprovalWork =
        row.approval_status === "draft" || row.approval_status === "pending";
      const missingRoster = row.roster_count === 0;
      const waitlistPressure = row.waitlist_count > 0;
      const capacityPressure =
        row.capacity !== null &&
        row.capacity > 0 &&
        row.registration_count >= Math.ceil(row.capacity * 0.9);

      if (!hasApprovalWork && !missingRoster && !startsSoon && !waitlistPressure && !capacityPressure) {
        return [];
      }

      const badges = [
        hasApprovalWork ? row.approval_status : null,
        missingRoster ? "no roster" : `${row.roster_count} rostered`,
        waitlistPressure ? `${row.waitlist_count} waitlisted` : null,
        capacityPressure ? "capacity pressure" : null,
        startsSoon ? "next 14 days" : null,
      ].filter((badge): badge is string => Boolean(badge));

      const status: ChurchAdminWeekendOperationItem["status"] =
        hasApprovalWork || missingRoster || waitlistPressure
          ? "blocked"
          : capacityPressure || startsSoon
            ? "in-progress"
            : "done";

      const registrationDetail =
        row.capacity !== null
          ? `${row.registration_count}/${row.capacity} registered`
          : `${row.registration_count} registered`;

      return [
        {
          id: `event-${row.id}`,
          eventId: row.id,
          title: row.title,
          detail: `${formatEventDate(row.starts_at)}${
            row.location ? ` · ${row.location}` : ""
          } · ${registrationDetail}`,
          status,
          href: `/app/church-admin/events/${row.id}`,
          badges,
        },
      ];
    })
    .slice(0, 8);
}

function buildCareItems(rows: CareOperationRow[]): ChurchAdminCareOperationItem[] {
  const now = Date.now();
  const twoDays = 2 * 24 * 60 * 60 * 1000;

  return rows
    .flatMap((row) => {
      if (row.status === "closed") {
        return [];
      }

      const dueAt = row.due_at ? new Date(row.due_at).getTime() : null;
      const createdAt = new Date(row.created_at).getTime();
      const isOverdue = dueAt !== null && dueAt < now;
      const dueSoon = dueAt !== null && dueAt - now <= twoDays && dueAt >= now;
      const isAging = now - createdAt >= twoDays && !row.last_contact_at;
      const unassigned = !row.assigned_to_name;
      const urgent = row.priority === "urgent";
      const highPriority = row.priority === "high" || urgent;

      if (!isOverdue && !dueSoon && !isAging && !unassigned && !highPriority) {
        return [];
      }

      const badges = [
        row.priority,
        row.status.replace("_", " "),
        unassigned ? "unassigned" : row.assigned_to_name,
        isOverdue ? "overdue" : dueSoon ? "due soon" : null,
        isAging ? "no contact" : null,
      ].filter((badge): badge is string => Boolean(badge));

      const status: ChurchAdminCareOperationItem["status"] =
        urgent || isOverdue || unassigned ? "blocked" : "in-progress";

      const dueDetail = row.due_at
        ? `${isOverdue ? "Due" : "Due"} ${formatShortDate(row.due_at)}`
        : "No due date";
      const ownerDetail = row.assigned_to_name
        ? `Assigned to ${row.assigned_to_name}`
        : "Unassigned";

      return [
        {
          id: `care-assignment-${row.id}`,
          title: row.profile_name,
          detail: `${row.summary} · ${ownerDetail} · ${dueDetail}`,
          status,
          href: `/app/church-admin/people?profile=${row.profile_id}`,
          badges,
        },
      ];
    })
    .slice(0, 8);
}

function buildCommunicationItems(
  logs: CommunicationLogOperationRow[],
  gaps: CommunicationGapOperationRow | null,
): ChurchAdminCommunicationOperationItem[] {
  const logItems = logs.flatMap((log) => {
    const isFailure = log.status === "failed" || log.status === "bounced";
    const isQueued = log.status === "queued";
    const isScheduled = Boolean(log.scheduled_for);

    if (!isFailure && !isQueued && !isScheduled) {
      return [];
    }

    const channel = log.channel.toUpperCase();
    const subject = log.subject ?? "Untitled message";
    const scheduledDetail = log.scheduled_for
      ? `Scheduled for ${formatShortDate(log.scheduled_for)}`
      : `Created ${formatShortDate(log.created_at)}`;

    return [
      {
        id: `communication-log-${log.id}`,
        title: `${channel}: ${subject}`,
        detail: scheduledDetail,
        status: isFailure ? "blocked" : "in-progress",
        href: "/app/communications",
        badges: [log.status, log.channel],
      } satisfies ChurchAdminCommunicationOperationItem,
    ];
  });

  const gapItems: ChurchAdminCommunicationOperationItem[] = [];

  if (gaps) {
    const missingContact = gaps.missing_email_count + gaps.missing_phone_count;
    const optOuts = gaps.email_opt_out_count + gaps.sms_opt_out_count;

    if (missingContact > 0 || gaps.contact_private_count > 0) {
      gapItems.push({
        id: "communication-contact-gaps",
        title: "Contact gaps need review",
        detail: `${missingContact} missing email/phone fields · ${gaps.contact_private_count} private contacts`,
        status: "blocked",
        href: "/app/church-admin/people",
        badges: ["contact data", "people"],
      });
    }

    if (optOuts > 0) {
      gapItems.push({
        id: "communication-consent-gaps",
        title: "Communication consent limits reach",
        detail: `${gaps.email_opt_out_count} email opt-outs · ${gaps.sms_opt_out_count} SMS opt-outs`,
        status: "in-progress",
        href: "/app/communications",
        badges: ["consent", "preferences"],
      });
    }
  }

  return [...logItems, ...gapItems].slice(0, 8);
}

function buildGivingItems(row: GivingOperationRow | null): ChurchAdminGivingOperationItem[] {
  if (!row) {
    return [];
  }

  const items: ChurchAdminGivingOperationItem[] = [];

  if (row.failed_count > 0 || row.pending_count > 0) {
    items.push({
      id: "giving-payment-exceptions",
      title: "Donation payment exceptions need review",
      detail: `${row.failed_count} failed · ${row.pending_count} pending`,
      status: row.failed_count > 0 ? "blocked" : "in-progress",
      href: "/app/church-admin/giving",
      badges: ["payments", "donations"],
    });
  }

  if (row.unsent_receipts_count > 0) {
    items.push({
      id: "giving-unsent-receipts",
      title: "Donation receipts need follow-up",
      detail: `${row.unsent_receipts_count} succeeded gifts have no receipt timestamp`,
      status: "in-progress",
      href: "/app/church-admin/giving",
      badges: ["receipts", "donor care"],
    });
  }

  if (row.unposted_gl_count > 0 || row.unmapped_fund_count > 0) {
    items.push({
      id: "giving-gl-reconciliation",
      title: "Giving GL reconciliation needs attention",
      detail: `${row.unposted_gl_count} gifts not posted · ${row.unmapped_fund_count} funds unmapped`,
      status: row.unmapped_fund_count > 0 ? "blocked" : "in-progress",
      href: "/app/church-admin/finance/journals",
      badges: ["GL", "finance"],
    });
  }

  if (row.giving_page_count === 0 || row.live_giving_page_count === 0) {
    items.push({
      id: "giving-page-configuration",
      title: "Public giving page is not live",
      detail:
        row.giving_page_count === 0
          ? "No public giving page has been configured."
          : "A giving page exists but is not live.",
      status: "blocked",
      href: "/app/church-admin/giving",
      badges: ["public giving", "setup"],
    });
  }

  return items.slice(0, 8);
}

function buildPreviewOperationsData(): ChurchAdminOperationsData {
  return {
    source: "preview",
    careItems: [],
    weekendItems: [],
    communicationItems: [],
    givingItems: [],
  };
}

export async function getChurchAdminOperationsData(
  session: ChurchAppSession,
): Promise<ChurchAdminOperationsData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewOperationsData();
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [careResult, eventResult, logResult, gapResult, givingResult] = await Promise.all([
      queryTenantLocalDb<CareOperationRow>(
        `
          select
            assignment.id,
            assignment.profile_id,
            coalesce(subject.full_name, 'Unknown person') as profile_name,
            assignee.full_name as assigned_to_name,
            assignment.summary,
            assignment.status,
            assignment.priority,
            assignment.due_at,
            assignment.last_contact_at,
            assignment.created_at
          from public.care_assignments assignment
          join public.profiles subject
            on subject.id = assignment.profile_id
           and subject.church_id = assignment.church_id
          left join public.profiles assignee
            on assignee.id = assignment.assigned_to
           and assignee.church_id = assignment.church_id
          where assignment.church_id = $1
            and assignment.status <> 'closed'
          order by
            case assignment.priority
              when 'urgent' then 1
              when 'high' then 2
              else 3
            end,
            assignment.due_at asc nulls last,
            assignment.created_at asc
          limit 30
        `,
        [churchId],
      ),
      queryTenantLocalDb<EventOperationRow>(
      `
        select
          event.id,
          event.title,
          event.starts_at,
          event.location,
          event.approval_status::text as approval_status,
          coalesce((
            select count(*)::int
            from public.event_rosters roster
            where roster.event_id = event.id
              and roster.church_id = event.church_id
          ), 0) as roster_count,
          coalesce((
            select count(*)::int
            from public.event_registrations registration
            where registration.event_id = event.id
              and registration.church_id = event.church_id
              and registration.status <> 'cancelled'
              and not registration.is_waitlisted
          ), 0) as registration_count,
          coalesce((
            select count(*)::int
            from public.event_registrations registration
            where registration.event_id = event.id
              and registration.church_id = event.church_id
              and registration.is_waitlisted
          ), 0) as waitlist_count,
          settings.capacity,
          settings.registration_open
        from public.events event
        left join public.event_registration_settings settings
          on settings.event_id = event.id
         and settings.church_id = event.church_id
        where event.church_id = $1
          and event.starts_at >= timezone('utc', now())
        order by event.starts_at asc
        limit 30
      `,
      [churchId],
      ),
      queryTenantLocalDb<CommunicationLogOperationRow>(
        `
          select id, channel, subject, status, scheduled_for, created_at
          from public.communication_logs
          where church_id = $1
            and (
              status in ('queued', 'failed', 'bounced')
              or scheduled_for is not null
            )
          order by coalesce(scheduled_for, created_at) asc
          limit 20
        `,
        [churchId],
      ),
      queryTenantLocalDb<CommunicationGapOperationRow>(
        `
          select
            count(*) filter (
              where coalesce(profile.email, '') = ''
            )::int as missing_email_count,
            count(*) filter (
              where coalesce(profile.phone, '') = ''
            )::int as missing_phone_count,
            count(*) filter (
              where coalesce(profile.contact_allowed, true) = false
            )::int as contact_private_count,
            count(*) filter (
              where coalesce(preferences.email_opt_in, true) = false
            )::int as email_opt_out_count,
            count(*) filter (
              where coalesce(preferences.sms_opt_in, false) = false
            )::int as sms_opt_out_count
          from public.profiles profile
          left join public.notification_preferences preferences
            on preferences.profile_id = profile.id
           and preferences.church_id = profile.church_id
          where profile.church_id = $1
            and profile.merged_at is null
            and coalesce(profile.membership_status, 'active') <> 'inactive'
        `,
        [churchId],
      ),
      queryTenantLocalDb<GivingOperationRow>(
        `
          with recent_donations as (
            select *
            from public.donations
            where church_id = $1
              and created_at >= timezone('utc', now()) - interval '30 days'
          ),
          succeeded_donations as (
            select *
            from recent_donations
            where status = 'succeeded'
          ),
          giving_pages as (
            select
              count(*)::int as giving_page_count,
              count(*) filter (where is_live)::int as live_giving_page_count
            from public.public_giving_pages
            where church_id = $1
          ),
          donation_counts as (
            select
              count(*) filter (where status = 'pending')::int as pending_count,
              count(*) filter (where status = 'failed')::int as failed_count,
              count(*) filter (
                where status = 'succeeded'
                  and receipt_sent_at is null
              )::int as unsent_receipts_count,
              count(*) filter (
                where status = 'succeeded'
                  and not exists (
                    select 1
                    from public.donation_gl_posts post
                    where post.donation_id = recent_donations.id
                      and post.church_id = recent_donations.church_id
                      and post.status = 'posted'
                  )
              )::int as unposted_gl_count
            from recent_donations
          )
          select
            donation_counts.pending_count,
            donation_counts.failed_count,
            donation_counts.unsent_receipts_count,
            donation_counts.unposted_gl_count,
            (
              select count(distinct coalesce(donation.fund_designation, 'General'))::int
              from succeeded_donations donation
              where not exists (
                select 1
                from public.giving_fund_accounts mapping
                where mapping.church_id = donation.church_id
                  and mapping.fund_designation = coalesce(donation.fund_designation, 'General')
                  and mapping.is_active
              )
            ) as unmapped_fund_count,
            giving_pages.giving_page_count,
            giving_pages.live_giving_page_count
          from donation_counts, giving_pages
        `,
        [churchId],
      ),
    ]);

    return {
      source: "live",
      careItems: buildCareItems(careResult.rows),
      weekendItems: buildWeekendItems(eventResult.rows),
      communicationItems: buildCommunicationItems(
        logResult.rows,
        gapResult.rows[0] ?? null,
      ),
      givingItems: buildGivingItems(givingResult.rows[0] ?? null),
    };
  }

  const supabase = await createTenantServerClient();
  const [
    eventsResult,
    logsResult,
    profilesResult,
    preferencesResult,
    donationsResult,
    glPostsResult,
    fundMappingsResult,
    givingPagesResult,
    careAssignmentsResult,
  ] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, starts_at, location, approval_status")
      .eq("church_id", churchId)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(30),
    supabase
      .from("communication_logs")
      .select("id, channel, subject, status, scheduled_for, created_at")
      .eq("church_id", churchId)
      .or("status.in.(queued,failed,bounced),scheduled_for.not.is.null")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("profiles")
      .select("id, email, phone, contact_allowed, membership_status")
      .eq("church_id", churchId)
      .is("merged_at", null),
    supabase
      .from("notification_preferences")
      .select("profile_id, email_opt_in, sms_opt_in")
      .eq("church_id", churchId),
    supabase
      .from("donations")
      .select("id, status, receipt_sent_at, fund_designation, created_at")
      .eq("church_id", churchId)
      .gte(
        "created_at",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      ),
    supabase
      .from("donation_gl_posts")
      .select("donation_id, status")
      .eq("church_id", churchId),
    supabase
      .from("giving_fund_accounts")
      .select("fund_designation, is_active")
      .eq("church_id", churchId),
    supabase
      .from("public_giving_pages")
      .select("id, is_live")
      .eq("church_id", churchId),
    supabase
      .from("care_assignments")
      .select(
        "id, profile_id, summary, status, priority, due_at, last_contact_at, created_at, subject:profiles!care_assignments_profile_id_fkey(full_name), assignee:profiles!care_assignments_assigned_to_fkey(full_name)",
      )
      .eq("church_id", churchId)
      .neq("status", "closed")
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(30),
  ]);

  for (const result of [
    eventsResult,
    logsResult,
    profilesResult,
    preferencesResult,
    donationsResult,
    glPostsResult,
    fundMappingsResult,
    givingPagesResult,
    careAssignmentsResult,
  ]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  const events = eventsResult.data ?? [];
  const eventIds = (events ?? []).map((event) => event.id);

  const [rostersResult, registrationsResult, settingsResult] =
    eventIds.length > 0
      ? await Promise.all([
          supabase
            .from("event_rosters")
            .select("event_id")
            .eq("church_id", churchId)
            .in("event_id", eventIds),
          supabase
            .from("event_registrations")
            .select("event_id, status, is_waitlisted")
            .eq("church_id", churchId)
            .in("event_id", eventIds),
          supabase
            .from("event_registration_settings")
            .select("event_id, capacity, registration_open")
            .eq("church_id", churchId)
            .in("event_id", eventIds),
        ])
      : [
          { data: [] as Array<{ event_id: string }>, error: null },
          { data: [] as Array<{ event_id: string; status: string; is_waitlisted: boolean }>, error: null },
          { data: [] as Array<{ event_id: string; capacity: number | null; registration_open: boolean | null }>, error: null },
        ];

  for (const result of [rostersResult, registrationsResult, settingsResult]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  const rosterCounts = new Map<string, number>();
  for (const roster of rostersResult.data ?? []) {
    rosterCounts.set(roster.event_id, (rosterCounts.get(roster.event_id) ?? 0) + 1);
  }

  const registrationCounts = new Map<string, number>();
  const waitlistCounts = new Map<string, number>();
  for (const registration of registrationsResult.data ?? []) {
    if (registration.is_waitlisted) {
      waitlistCounts.set(
        registration.event_id,
        (waitlistCounts.get(registration.event_id) ?? 0) + 1,
      );
    } else if (registration.status !== "cancelled") {
      registrationCounts.set(
        registration.event_id,
        (registrationCounts.get(registration.event_id) ?? 0) + 1,
      );
    }
  }

  const settingsByEventId = new Map(
    (settingsResult.data ?? []).map((settings) => [settings.event_id, settings]),
  );

  const rows: EventOperationRow[] = events.map((event) => {
    const settings = settingsByEventId.get(event.id);

    return {
      id: event.id,
      title: event.title,
      starts_at: event.starts_at,
      location: event.location,
      approval_status: event.approval_status,
      roster_count: rosterCounts.get(event.id) ?? 0,
      registration_count: registrationCounts.get(event.id) ?? 0,
      waitlist_count: waitlistCounts.get(event.id) ?? 0,
      capacity: settings?.capacity ?? null,
      registration_open: settings?.registration_open ?? null,
    };
  });

  const preferencesByProfileId = new Map(
    (preferencesResult.data ?? []).map((preference) => [
      preference.profile_id,
      preference,
    ]),
  );
  const activeProfiles = (profilesResult.data ?? []).filter(
    (profile) => profile.membership_status !== "inactive",
  );
  const communicationGaps: CommunicationGapOperationRow = {
    missing_email_count: activeProfiles.filter((profile) => !profile.email).length,
    missing_phone_count: activeProfiles.filter((profile) => !profile.phone).length,
    contact_private_count: activeProfiles.filter(
      (profile) => profile.contact_allowed === false,
    ).length,
    email_opt_out_count: activeProfiles.filter(
      (profile) => preferencesByProfileId.get(profile.id)?.email_opt_in === false,
    ).length,
    sms_opt_out_count: activeProfiles.filter(
      (profile) => preferencesByProfileId.get(profile.id)?.sms_opt_in !== true,
    ).length,
  };
  const postedDonationIds = new Set(
    (glPostsResult.data ?? [])
      .filter((post) => post.status === "posted")
      .map((post) => post.donation_id),
  );
  const activeFundMappings = new Set(
    (fundMappingsResult.data ?? [])
      .filter((mapping) => mapping.is_active)
      .map((mapping) => mapping.fund_designation),
  );
  const donations = donationsResult.data ?? [];
  const succeededDonations = donations.filter((donation) => donation.status === "succeeded");
  const givingRows: GivingOperationRow = {
    pending_count: donations.filter((donation) => donation.status === "pending").length,
    failed_count: donations.filter((donation) => donation.status === "failed").length,
    unsent_receipts_count: succeededDonations.filter((donation) => !donation.receipt_sent_at).length,
    unposted_gl_count: succeededDonations.filter((donation) => !postedDonationIds.has(donation.id)).length,
    unmapped_fund_count: new Set(
      succeededDonations
        .map((donation) => donation.fund_designation ?? "General")
        .filter((fund) => !activeFundMappings.has(fund)),
    ).size,
    giving_page_count: (givingPagesResult.data ?? []).length,
    live_giving_page_count: (givingPagesResult.data ?? []).filter((page) => page.is_live).length,
  };
  const careRows: CareOperationRow[] = (careAssignmentsResult.data ?? []).map((assignment) => {
    const subject = Array.isArray(assignment.subject) ? assignment.subject[0] : assignment.subject;
    const assignee = Array.isArray(assignment.assignee) ? assignment.assignee[0] : assignment.assignee;

    return {
      id: assignment.id,
      profile_id: assignment.profile_id,
      profile_name: subject?.full_name ?? "Unknown person",
      assigned_to_name: assignee?.full_name ?? null,
      summary: assignment.summary,
      status: assignment.status,
      priority: assignment.priority,
      due_at: assignment.due_at,
      last_contact_at: assignment.last_contact_at,
      created_at: assignment.created_at,
    };
  });

  return {
    source: "live",
    careItems: buildCareItems(careRows),
    weekendItems: buildWeekendItems(rows),
    communicationItems: buildCommunicationItems(
      (logsResult.data ?? []) as CommunicationLogOperationRow[],
      communicationGaps,
    ),
    givingItems: buildGivingItems(givingRows),
  };
}
