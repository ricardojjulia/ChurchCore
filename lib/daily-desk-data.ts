import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type DailyDeskWorkItem = {
  id: string;
  itemType: string;
  title: string;
  body: string | null;
  status: string;
  priority: string;
  direction: string | null;
  relatedProfileId: string | null;
  relatedProfileName: string | null;
  assignedToProfileId: string | null;
  assignedToName: string | null;
  scheduledAt: string | null;
  dueAt: string | null;
  location: string | null;
  createdAt: string;
};

export type DailyDeskPersonOption = {
  id: string;
  fullName: string;
  email: string | null;
};

export type DailyDeskSignal = {
  id: string;
  label: string;
  value: number;
  detail: string;
  href: string;
  severity: "normal" | "attention" | "urgent";
};

export type DailyDeskEvent = {
  id: string;
  title: string;
  startsAt: string;
  location: string | null;
};

export type DailyDeskData = {
  source: "preview" | "live";
  today: DailyDeskWorkItem[];
  inbox: DailyDeskWorkItem[];
  completedToday: DailyDeskWorkItem[];
  people: DailyDeskPersonOption[];
  events: DailyDeskEvent[];
  signals: DailyDeskSignal[];
};

type WorkItemRow = {
  id: string;
  item_type: string;
  title: string;
  body: string | null;
  status: string;
  priority: string;
  direction: string | null;
  related_profile_id: string | null;
  related_profile_name: string | null;
  assigned_to_profile_id: string | null;
  assigned_to_name: string | null;
  scheduled_at: string | null;
  due_at: string | null;
  location: string | null;
  created_at: string;
};

function mapWorkItem(row: WorkItemRow): DailyDeskWorkItem {
  return {
    id: row.id,
    itemType: row.item_type,
    title: row.title,
    body: row.body,
    status: row.status,
    priority: row.priority,
    direction: row.direction,
    relatedProfileId: row.related_profile_id,
    relatedProfileName: row.related_profile_name,
    assignedToProfileId: row.assigned_to_profile_id,
    assignedToName: row.assigned_to_name,
    scheduledAt: row.scheduled_at,
    dueAt: row.due_at,
    location: row.location,
    createdAt: row.created_at,
  };
}

function buildPreviewData(): DailyDeskData {
  const now = new Date().toISOString();
  return {
    source: "preview",
    today: [
      {
        id: "preview-call",
        itemType: "call",
        title: "Return call to new visitor family",
        body: "Ask about next steps and connect them with the welcome team.",
        status: "open",
        priority: "high",
        direction: "outgoing",
        relatedProfileId: null,
        relatedProfileName: "Noah Brooks",
        assignedToProfileId: null,
        assignedToName: "Church office",
        scheduledAt: now,
        dueAt: now,
        location: null,
        createdAt: now,
      },
    ],
    inbox: [],
    completedToday: [],
    people: [],
    events: [],
    signals: [
      {
        id: "preview-readiness",
        label: "Weekly readiness",
        value: 3,
        detail: "Preview items need review.",
        href: "/app/church-admin/readiness",
        severity: "attention",
      },
    ],
  };
}

function signal(
  id: string,
  label: string,
  value: number,
  detail: string,
  href: string,
  urgentThreshold = 5,
): DailyDeskSignal {
  return {
    id,
    label,
    value,
    detail,
    href,
    severity: value >= urgentThreshold ? "urgent" : value > 0 ? "attention" : "normal",
  };
}

export async function getDailyDeskData(session: ChurchAppSession): Promise<DailyDeskData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewData();
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [
      workItemsResult,
      peopleResult,
      eventsResult,
      accountResult,
      careResult,
      workflowResult,
      rosterResult,
    ] = await Promise.all([
      queryTenantLocalDb<WorkItemRow>(
        `
          select
            item.id,
            item.item_type,
            item.title,
            item.body,
            item.status,
            item.priority,
            item.direction,
            item.related_profile_id,
            related.full_name as related_profile_name,
            item.assigned_to_profile_id,
            assignee.full_name as assigned_to_name,
            item.scheduled_at,
            item.due_at,
            item.location,
            item.created_at
          from public.daily_work_items item
          left join public.profiles related
            on related.id = item.related_profile_id
           and related.church_id = item.church_id
          left join public.profiles assignee
            on assignee.id = item.assigned_to_profile_id
           and assignee.church_id = item.church_id
          where item.church_id = $1
            and (
              item.status <> 'done'
              or item.completed_at >= date_trunc('day', timezone('utc', now()))
            )
          order by
            case item.priority
              when 'urgent' then 1
              when 'high' then 2
              when 'normal' then 3
              else 4
            end,
            coalesce(item.due_at, item.scheduled_at, item.created_at) asc
          limit 60
        `,
        [churchId],
      ),
      queryTenantLocalDb<{ id: string; full_name: string; email: string | null }>(
        `
          select id, full_name, email
          from public.profiles
          where church_id = $1
            and merged_at is null
          order by full_name
          limit 80
        `,
        [churchId],
      ),
      queryTenantLocalDb<{ id: string; title: string; starts_at: string; location: string | null }>(
        `
          select id, title, starts_at, location
          from public.events
          where church_id = $1
            and starts_at >= timezone('utc', now())
            and starts_at < timezone('utc', now()) + interval '48 hours'
          order by starts_at asc
          limit 8
        `,
        [churchId],
      ),
      queryTenantLocalDb<{ count: number }>(
        `select count(*)::int from public.account_requests where church_id = $1 and status = 'pending'`,
        [churchId],
      ),
      queryTenantLocalDb<{ count: number }>(
        `select count(*)::int from public.care_assignments where church_id = $1 and status <> 'closed'`,
        [churchId],
      ),
      queryTenantLocalDb<{ count: number }>(
        `select count(*)::int from public.workflows where tenant_id = $1 and status in ('open', 'assigned')`,
        [churchId],
      ),
      queryTenantLocalDb<{ count: number }>(
        `
          select count(*)::int
          from public.events event
          where event.church_id = $1
            and event.starts_at >= timezone('utc', now())
            and event.starts_at < timezone('utc', now()) + interval '7 days'
            and not exists (
              select 1 from public.event_rosters roster
              where roster.event_id = event.id
                and roster.church_id = event.church_id
            )
        `,
        [churchId],
      ),
    ]);

    const items = workItemsResult.rows.map(mapWorkItem);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrow = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const isToday = (value: string | null) => {
      if (!value) return false;
      const time = new Date(value).getTime();
      return time >= todayStart.getTime() && time < tomorrow.getTime();
    };

    return {
      source: "live",
      today: items.filter((item) => item.status !== "done" && (isToday(item.dueAt) || isToday(item.scheduledAt))),
      inbox: items.filter((item) => item.status !== "done" && !isToday(item.dueAt) && !isToday(item.scheduledAt)),
      completedToday: items.filter((item) => item.status === "done"),
      people: peopleResult.rows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        email: row.email,
      })),
      events: eventsResult.rows.map((row) => ({
        id: row.id,
        title: row.title,
        startsAt: row.starts_at,
        location: row.location,
      })),
      signals: [
        signal("account-requests", "Account requests", accountResult.rows[0]?.count ?? 0, "Pending portal approvals", "/app/church-admin/accounts?status=pending"),
        signal("care", "Care follow-up", careResult.rows[0]?.count ?? 0, "Open care assignments", "/app/church-admin/people?q=care"),
        signal("workflows", "Suggested workflows", workflowResult.rows[0]?.count ?? 0, "Open ministry workflows", "/app/church-admin/workflows?status=open"),
        signal("rosters", "Roster gaps", rosterResult.rows[0]?.count ?? 0, "Events in 7 days without roster coverage", "/app/church-admin/events?view=needs-roster", 3),
      ],
    };
  }

  const supabase = await createTenantServerClient();
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrow = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const next48 = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const next7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    workItemsResult,
    peopleResult,
    eventsResult,
    accountResult,
    careResult,
    workflowResult,
    rosterEventsResult,
    rostersResult,
  ] = await Promise.all([
    supabase
      .from("daily_work_items")
      .select("*, related:related_profile_id(full_name), assignee:assigned_to_profile_id(full_name)")
      .eq("church_id", churchId)
      .or(`status.neq.done,completed_at.gte.${todayStart.toISOString()}`)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("church_id", churchId)
      .is("merged_at", null)
      .order("full_name")
      .limit(80),
    supabase
      .from("events")
      .select("id, title, starts_at, location")
      .eq("church_id", churchId)
      .gte("starts_at", now.toISOString())
      .lt("starts_at", next48.toISOString())
      .order("starts_at")
      .limit(8),
    supabase.from("account_requests").select("id").eq("church_id", churchId).eq("status", "pending"),
    supabase.from("care_assignments").select("id").eq("church_id", churchId).neq("status", "closed"),
    supabase.from("workflows").select("id").eq("tenant_id", churchId).in("status", ["open", "assigned"]),
    supabase
      .from("events")
      .select("id")
      .eq("church_id", churchId)
      .gte("starts_at", now.toISOString())
      .lt("starts_at", next7.toISOString()),
    supabase.from("event_rosters").select("event_id").eq("church_id", churchId),
  ]);

  const items =
    workItemsResult.data?.map((row) =>
      mapWorkItem({
        id: row.id,
        item_type: row.item_type,
        title: row.title,
        body: row.body,
        status: row.status,
        priority: row.priority,
        direction: row.direction,
        related_profile_id: row.related_profile_id,
        related_profile_name: Array.isArray(row.related) ? row.related[0]?.full_name ?? null : row.related?.full_name ?? null,
        assigned_to_profile_id: row.assigned_to_profile_id,
        assigned_to_name: Array.isArray(row.assignee) ? row.assignee[0]?.full_name ?? null : row.assignee?.full_name ?? null,
        scheduled_at: row.scheduled_at,
        due_at: row.due_at,
        location: row.location,
        created_at: row.created_at,
      }),
    ) ?? [];
  const isToday = (value: string | null) => {
    if (!value) return false;
    const time = new Date(value).getTime();
    return time >= todayStart.getTime() && time < tomorrow.getTime();
  };
  const rosteredEventIds = new Set((rostersResult.data ?? []).map((row) => row.event_id));
  const rosterGapCount = (rosterEventsResult.data ?? []).filter((event) => !rosteredEventIds.has(event.id)).length;

  return {
    source: "live",
    today: items.filter((item) => item.status !== "done" && (isToday(item.dueAt) || isToday(item.scheduledAt))),
    inbox: items.filter((item) => item.status !== "done" && !isToday(item.dueAt) && !isToday(item.scheduledAt)),
    completedToday: items.filter((item) => item.status === "done"),
    people:
      peopleResult.data?.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        email: row.email,
      })) ?? [],
    events:
      eventsResult.data?.map((row) => ({
        id: row.id,
        title: row.title,
        startsAt: row.starts_at,
        location: row.location,
      })) ?? [],
    signals: [
      signal("account-requests", "Account requests", accountResult.data?.length ?? 0, "Pending portal approvals", "/app/church-admin/accounts?status=pending"),
      signal("care", "Care follow-up", careResult.data?.length ?? 0, "Open care assignments", "/app/church-admin/people?q=care"),
      signal("workflows", "Suggested workflows", workflowResult.data?.length ?? 0, "Open ministry workflows", "/app/church-admin/workflows?status=open"),
      signal("rosters", "Roster gaps", rosterGapCount, "Events in 7 days without roster coverage", "/app/church-admin/events?view=needs-roster", 3),
    ],
  };
}
