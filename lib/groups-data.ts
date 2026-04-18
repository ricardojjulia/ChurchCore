import "server-only";

import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  Group,
  GroupDetail,
  GroupMember,
  GroupMeeting,
  GroupResource,
  GroupsListData,
  ServiceAttendanceEntry,
  FirstTimeVisitor,
} from "@/lib/groups-types";

// ── Empty fallbacks ──────────────────────────────────────────

const EMPTY_LIST: GroupsListData = { groups: [], totalCount: 0 };

const EMPTY_DETAIL: GroupDetail = {
  group: {
    id: "", churchId: "", name: "", description: null, category: "general",
    leaderProfileId: null, leaderName: null, meetingDay: null,
    meetingTime: null, meetingLocation: null, capacity: null,
    memberCount: 0, isOpen: true, isActive: true, createdAt: "",
  },
  members: [],
  upcomingMeetings: [],
  pastMeetings: [],
  resources: [],
};

// ── Mappers ──────────────────────────────────────────────────

function mapGroupRow(r: {
  id: string;
  church_id: string;
  name: string;
  description: string | null;
  category: string;
  leader_profile_id: string | null;
  leader_name: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
  meeting_location: string | null;
  capacity: number | null;
  member_count: number;
  is_open: boolean;
  is_active: boolean;
  created_at: string;
}): Group {
  return {
    id: r.id,
    churchId: r.church_id,
    name: r.name,
    description: r.description,
    category: r.category as Group["category"],
    leaderProfileId: r.leader_profile_id,
    leaderName: r.leader_name,
    meetingDay: r.meeting_day,
    meetingTime: r.meeting_time,
    meetingLocation: r.meeting_location,
    capacity: r.capacity,
    memberCount: r.member_count,
    isOpen: r.is_open,
    isActive: r.is_active,
    createdAt: r.created_at,
  };
}

function mapMemberRow(r: {
  id: string;
  group_id: string;
  profile_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  joined_at: string;
}): GroupMember {
  return {
    id: r.id,
    groupId: r.group_id,
    profileId: r.profile_id,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone,
    role: r.role as GroupMember["role"],
    status: r.status as GroupMember["status"],
    joinedAt: r.joined_at,
  };
}

function mapMeetingRow(r: {
  id: string;
  group_id: string;
  scheduled_at: string;
  location: string | null;
  notes: string | null;
  attendance_count: number;
  created_at: string;
}): GroupMeeting {
  return {
    id: r.id,
    groupId: r.group_id,
    scheduledAt: r.scheduled_at,
    location: r.location,
    notes: r.notes,
    attendanceCount: r.attendance_count,
    createdAt: r.created_at,
  };
}

function mapResourceRow(r: {
  id: string;
  group_id: string;
  title: string;
  url: string | null;
  resource_type: string;
  added_by_name: string | null;
  created_at: string;
}): GroupResource {
  return {
    id: r.id,
    groupId: r.group_id,
    title: r.title,
    url: r.url,
    resourceType: r.resource_type as GroupResource["resourceType"],
    addedByName: r.added_by_name,
    createdAt: r.created_at,
  };
}

// ── Data functions ───────────────────────────────────────────

export async function getGroupsList(
  session: ChurchAppSession,
  { activeOnly = true }: { activeOnly?: boolean } = {},
): Promise<GroupsListData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return EMPTY_LIST;
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string;
      church_id: string;
      name: string;
      description: string | null;
      category: string;
      leader_profile_id: string | null;
      leader_name: string | null;
      meeting_day: string | null;
      meeting_time: string | null;
      meeting_location: string | null;
      capacity: number | null;
      member_count: number;
      is_open: boolean;
      is_active: boolean;
      created_at: string;
    }>(
      `select
         g.id, g.church_id, g.name, g.description, g.category,
         g.leader_profile_id,
         lp.full_name as leader_name,
         g.meeting_day, g.meeting_time, g.meeting_location,
         g.capacity, g.is_open, g.is_active, g.created_at,
         coalesce((
           select count(*)::int from public.group_members gm
           where gm.group_id = g.id and gm.status = 'active'
         ), 0) as member_count
       from public.groups g
       left join public.profiles lp on lp.id = g.leader_profile_id
       where g.church_id = $1
         ${activeOnly ? "and g.is_active = true" : ""}
       order by g.name`,
      [churchId],
    );
    const groups = result.rows.map(mapGroupRow);
    return { groups, totalCount: groups.length };
  }

  const supabase = await createTenantServerClient();
  let query = supabase
    .from("groups")
    .select("*, profiles!groups_leader_profile_id_fkey(full_name)")
    .eq("church_id", churchId)
    .order("name");
  if (activeOnly) query = query.eq("is_active", true);

  const { data } = await query;

  const groups = (data ?? []).map((r) => {
    const leaderProfile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return mapGroupRow({
      ...r,
      leader_name: (leaderProfile as { full_name?: string } | null)?.full_name ?? null,
      member_count: 0,
    });
  });

  return { groups, totalCount: groups.length };
}

export async function getGroupDetail(
  session: ChurchAppSession,
  groupId: string,
): Promise<GroupDetail | null> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return EMPTY_DETAIL;
  }

  const churchId = session.appContext.church.id;
  const now = new Date().toISOString();

  if (shouldUseLocalTenantFallback()) {
    const [groupRows, memberRows, meetingRows, resourceRows] = await Promise.all([
      queryTenantLocalDb<{
        id: string; church_id: string; name: string; description: string | null;
        category: string; leader_profile_id: string | null; leader_name: string | null;
        meeting_day: string | null; meeting_time: string | null; meeting_location: string | null;
        capacity: number | null; member_count: number; is_open: boolean; is_active: boolean; created_at: string;
      }>(
        `select g.id, g.church_id, g.name, g.description, g.category,
                g.leader_profile_id, lp.full_name as leader_name,
                g.meeting_day, g.meeting_time, g.meeting_location,
                g.capacity, g.is_open, g.is_active, g.created_at,
                coalesce((select count(*)::int from public.group_members gm
                           where gm.group_id = g.id and gm.status = 'active'), 0) as member_count
         from public.groups g
         left join public.profiles lp on lp.id = g.leader_profile_id
         where g.id = $1 and g.church_id = $2`,
        [groupId, churchId],
      ),
      queryTenantLocalDb<{
        id: string; group_id: string; profile_id: string; full_name: string;
        email: string | null; phone: string | null; role: string; status: string; joined_at: string;
      }>(
        `select gm.id, gm.group_id, gm.profile_id, p.full_name, p.email, p.phone,
                gm.role, gm.status, gm.joined_at
         from public.group_members gm
         join public.profiles p on p.id = gm.profile_id
         where gm.group_id = $1
         order by gm.role desc, p.full_name`,
        [groupId],
      ),
      queryTenantLocalDb<{
        id: string; group_id: string; scheduled_at: string; location: string | null;
        notes: string | null; attendance_count: number; created_at: string;
      }>(
        `select gmt.id, gmt.group_id, gmt.scheduled_at, gmt.location, gmt.notes, gmt.created_at,
                coalesce((select count(*)::int from public.group_attendance ga
                           where ga.meeting_id = gmt.id and ga.status = 'present'), 0) as attendance_count
         from public.group_meetings gmt
         where gmt.group_id = $1
         order by gmt.scheduled_at desc
         limit 20`,
        [groupId],
      ),
      queryTenantLocalDb<{
        id: string; group_id: string; title: string; url: string | null;
        resource_type: string; added_by_name: string | null; created_at: string;
      }>(
        `select gr.id, gr.group_id, gr.title, gr.url, gr.resource_type,
                p.full_name as added_by_name, gr.created_at
         from public.group_resources gr
         left join public.profiles p on p.id = gr.added_by
         where gr.group_id = $1
         order by gr.created_at desc`,
        [groupId],
      ),
    ]);

    if (!groupRows.rows[0]) return null;

    const allMeetings = meetingRows.rows.map(mapMeetingRow);
    return {
      group: mapGroupRow(groupRows.rows[0]),
      members: memberRows.rows.map(mapMemberRow),
      upcomingMeetings: allMeetings.filter((m) => m.scheduledAt >= now),
      pastMeetings: allMeetings.filter((m) => m.scheduledAt < now),
      resources: resourceRows.rows.map(mapResourceRow),
    };
  }

  const supabase = await createTenantServerClient();
  const { data: groupData } = await supabase
    .from("groups")
    .select("*, profiles!groups_leader_profile_id_fkey(full_name)")
    .eq("id", groupId)
    .eq("church_id", churchId)
    .single();

  if (!groupData) return null;

  const [{ data: memberData }, { data: meetingData }, { data: resourceData }] =
    await Promise.all([
      supabase
        .from("group_members")
        .select("*, profiles(full_name, email, phone)")
        .eq("group_id", groupId)
        .order("role", { ascending: false }),
      supabase
        .from("group_meetings")
        .select("*")
        .eq("group_id", groupId)
        .order("scheduled_at", { ascending: false })
        .limit(20),
      supabase
        .from("group_resources")
        .select("*, profiles(full_name)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false }),
    ]);

  const leaderProfile = Array.isArray(groupData.profiles)
    ? groupData.profiles[0]
    : groupData.profiles;

  const group = mapGroupRow({
    ...groupData,
    leader_name: (leaderProfile as { full_name?: string } | null)?.full_name ?? null,
    member_count: (memberData ?? []).filter((m) => m.status === "active").length,
  });

  const members = (memberData ?? []).map((m) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return mapMemberRow({
      ...m,
      full_name: (p as { full_name?: string } | null)?.full_name ?? "",
      email: (p as { email?: string } | null)?.email ?? null,
      phone: (p as { phone?: string } | null)?.phone ?? null,
    });
  });

  const allMeetings = (meetingData ?? []).map((m) =>
    mapMeetingRow({ ...m, attendance_count: 0 }),
  );

  const resources = (resourceData ?? []).map((r) => {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return mapResourceRow({
      ...r,
      added_by_name: (p as { full_name?: string } | null)?.full_name ?? null,
    });
  });

  return {
    group,
    members,
    upcomingMeetings: allMeetings.filter((m) => m.scheduledAt >= now),
    pastMeetings: allMeetings.filter((m) => m.scheduledAt < now),
    resources,
  };
}

export async function getServiceAttendanceList(
  session: ChurchAppSession,
): Promise<ServiceAttendanceEntry[]> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") return [];
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string; service_date: string; service_type: string;
      headcount: number | null; notes: string | null; created_at: string;
    }>(
      `select id, service_date, service_type, headcount, notes, created_at
       from public.service_attendance
       where church_id = $1
       order by service_date desc
       limit 52`,
      [churchId],
    );
    return result.rows.map((r) => ({
      id: r.id, serviceDate: r.service_date, serviceType: r.service_type,
      headcount: r.headcount, notes: r.notes, createdAt: r.created_at,
    }));
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("service_attendance")
    .select("id, service_date, service_type, headcount, notes, created_at")
    .eq("church_id", churchId)
    .order("service_date", { ascending: false })
    .limit(52);

  return (data ?? []).map((r) => ({
    id: r.id, serviceDate: r.service_date, serviceType: r.service_type,
    headcount: r.headcount, notes: r.notes, createdAt: r.created_at,
  }));
}

export async function getFirstTimeVisitors(
  session: ChurchAppSession,
): Promise<FirstTimeVisitor[]> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") return [];
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string; full_name: string; email: string | null; phone: string | null;
      visit_date: string; referred_by: string | null; how_did_hear: string | null;
      workflow_stage: string; workflow_notes: string | null; converted_at: string | null; created_at: string;
    }>(
      `select id, full_name, email, phone, visit_date, referred_by, how_did_hear,
              workflow_stage, workflow_notes, converted_at, created_at
       from public.first_time_visitors
       where church_id = $1
       order by visit_date desc`,
      [churchId],
    );
    return result.rows.map((r) => ({
      id: r.id, fullName: r.full_name, email: r.email, phone: r.phone,
      visitDate: r.visit_date, referredBy: r.referred_by, howDidHear: r.how_did_hear,
      workflowStage: r.workflow_stage, workflowNotes: r.workflow_notes,
      convertedAt: r.converted_at, createdAt: r.created_at,
    }));
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("first_time_visitors")
    .select("id, full_name, email, phone, visit_date, referred_by, how_did_hear, workflow_stage, workflow_notes, converted_at, created_at")
    .eq("church_id", churchId)
    .order("visit_date", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id, fullName: r.full_name, email: r.email, phone: r.phone,
    visitDate: r.visit_date, referredBy: r.referred_by, howDidHear: r.how_did_hear,
    workflowStage: r.workflow_stage, workflowNotes: r.workflow_notes,
    convertedAt: r.converted_at, createdAt: r.created_at,
  }));
}
