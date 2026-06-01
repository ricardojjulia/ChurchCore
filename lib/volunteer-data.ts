import "server-only";

import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  MemberScheduleEntry,
  ServicePlanDetail,
  ServicePlanItem,
  ServicePlanListEntry,
  ServicePlanTemplate,
  VolunteerDirectoryEntry,
  VolunteerPoolEntry,
} from "@/lib/volunteer-types";

// ── Service plan list ────────────────────────────────────────

export async function getServicePlanList(
  session: ChurchAppSession,
  { upcoming = true }: { upcoming?: boolean } = {},
): Promise<ServicePlanListEntry[]> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") return [];
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string; church_id: string; event_id: string | null;
      name: string; service_date: string; service_time: string | null;
      service_type: string; scripture_reference: string | null;
      sermon_title: string | null; sermon_speaker: string | null;
      status: string; notes: string | null; created_by: string | null; created_at: string;
      position_count: number; filled_count: number; confirmed_count: number;
    }>(
      `select
         sp.*,
         count(distinct spp.id)::int                                            as position_count,
         count(vs.id) filter (where vs.confirmation_status != 'declined')::int  as filled_count,
         count(vs.id) filter (where vs.confirmation_status = 'confirmed')::int  as confirmed_count
       from public.service_plans sp
       left join public.service_plan_positions spp on spp.plan_id = sp.id
       left join public.volunteer_shifts vs on vs.plan_id = sp.id
       where sp.church_id = $1
         and sp.service_date ${upcoming ? ">=" : "<"} current_date
       group by sp.id
       order by sp.service_date ${upcoming ? "asc" : "desc"}
       limit 52`,
      [churchId],
    );
    return result.rows.map(mapPlanListRow);
  }

  const supabase = await createTenantServerClient();
  const op = upcoming ? "gte" : "lt";
  const { data } = await supabase
    .from("service_plans")
    .select("*, service_plan_positions(id), volunteer_shifts(id, confirmation_status)")
    .eq("church_id", churchId)
    [op]("service_date", new Date().toISOString().slice(0, 10))
    .order("service_date", { ascending: upcoming })
    .limit(52);

  return (data ?? []).map((r) => {
    const shifts = (r.volunteer_shifts ?? []) as { confirmation_status: string }[];
    return {
      id: r.id, churchId: r.church_id, eventId: r.event_id,
      name: r.name, serviceDate: r.service_date, serviceTime: r.service_time,
      serviceType: (r.service_type as ServicePlanListEntry["serviceType"]) ?? "worship",
      scriptureReference: r.scripture_reference,
      sermonTitle: r.sermon_title,
      sermonSpeaker: r.sermon_speaker,
      status: r.status as ServicePlanListEntry["status"], notes: r.notes,
      createdBy: r.created_by, createdAt: r.created_at,
      positionCount: (r.service_plan_positions ?? []).length,
      filledCount: shifts.filter((s) => s.confirmation_status !== "declined").length,
      confirmedCount: shifts.filter((s) => s.confirmation_status === "confirmed").length,
    };
  });
}

function mapPlanListRow(r: {
  id: string; church_id: string; event_id: string | null;
  name: string; service_date: string; service_time: string | null;
  service_type: string; scripture_reference: string | null;
  sermon_title: string | null; sermon_speaker: string | null;
  status: string; notes: string | null; created_by: string | null; created_at: string;
  position_count: number; filled_count: number; confirmed_count: number;
}): ServicePlanListEntry {
  return {
    id: r.id, churchId: r.church_id, eventId: r.event_id,
    name: r.name, serviceDate: r.service_date, serviceTime: r.service_time,
    serviceType: (r.service_type as ServicePlanListEntry["serviceType"]) ?? "worship",
    scriptureReference: r.scripture_reference,
    sermonTitle: r.sermon_title,
    sermonSpeaker: r.sermon_speaker,
    status: r.status as ServicePlanListEntry["status"], notes: r.notes,
    createdBy: r.created_by, createdAt: r.created_at,
    positionCount: r.position_count, filledCount: r.filled_count, confirmedCount: r.confirmed_count,
  };
}

// ── Service plan detail ──────────────────────────────────────

export async function getServicePlanDetail(
  session: ChurchAppSession,
  planId: string,
): Promise<ServicePlanDetail | null> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") return null;
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [planResult, posResult, shiftResult, reminderResult, runItemsResult] = await Promise.all([
      queryTenantLocalDb<{
        id: string; church_id: string; event_id: string | null;
        name: string; service_date: string; service_time: string | null;
        service_type: string; scripture_reference: string | null;
        sermon_title: string | null; sermon_speaker: string | null;
        status: string; notes: string | null; created_by: string | null; created_at: string;
      }>(
        `select id, church_id, event_id, name, service_date, service_time,
                service_type, scripture_reference, sermon_title, sermon_speaker,
                status, notes, created_by, created_at
         from public.service_plans
         where id = $1 and church_id = $2`,
        [planId, churchId],
      ),
      queryTenantLocalDb<{
        id: string; plan_id: string; church_id: string;
        role_name: string; quantity_needed: number; ministry_id: string | null; sort_order: number;
      }>(
        `select id, plan_id, church_id, role_name, quantity_needed, ministry_id, sort_order
         from public.service_plan_positions
         where plan_id = $1
         order by sort_order, role_name`,
        [planId],
      ),
      queryTenantLocalDb<{
        id: string; church_id: string; event_id: string | null; plan_id: string | null;
        position_id: string | null; assigned_user_id: string | null; title: string;
        starts_at: string; ends_at: string; status: string;
        confirmation_status: string; decline_reason: string | null;
        responded_at: string | null; volunteer_notes: string | null;
        full_name: string | null; email: string | null; phone: string | null;
      }>(
        `select vs.id, vs.church_id, vs.event_id, vs.plan_id, vs.position_id,
                vs.assigned_user_id, vs.title, vs.starts_at, vs.ends_at, vs.status,
                vs.confirmation_status, vs.decline_reason, vs.responded_at, vs.volunteer_notes,
                p.full_name, p.email, p.phone
         from public.volunteer_shifts vs
         left join public.profiles p on p.id = vs.assigned_user_id
         where vs.plan_id = $1
         order by vs.starts_at`,
        [planId],
      ),
      queryTenantLocalDb<{
        shift_id: string;
        reminder_count: number;
        last_reminder_at: string | null;
      }>(
        `select
           shift_id,
           count(*)::int as reminder_count,
           max(sent_at)::text as last_reminder_at
         from public.volunteer_shift_reminders
         where church_id = $1
           and shift_id in (
             select id
             from public.volunteer_shifts
             where plan_id = $2
           )
         group by shift_id`,
        [churchId, planId],
      ),
      queryTenantLocalDb<{
        id: string; plan_id: string; church_id: string;
        starts_at: string | null; ends_at: string | null;
        title: string; item_type: string; leader_name: string | null;
        notes: string | null; attachment_url: string | null; sort_order: number;
        song_key: string | null; duration_seconds: number | null; artist: string | null;
      }>(
        `select id, plan_id, church_id, starts_at, ends_at, title, item_type,
                leader_name, notes, attachment_url, sort_order,
                song_key, duration_seconds, artist
         from public.service_plan_items
         where plan_id = $1
         order by sort_order, starts_at nulls last`,
        [planId],
      ),
    ]);

    const plan = planResult.rows[0];
    if (!plan) return null;

    const reminderByShiftId = new Map(reminderResult.rows.map((row) => [row.shift_id, row]));

    const shifts = shiftResult.rows.map((s) => ({
      id: s.id, churchId: s.church_id, eventId: s.event_id, planId: s.plan_id,
      positionId: s.position_id, assignedUserId: s.assigned_user_id,
      title: s.title, startsAt: s.starts_at, endsAt: s.ends_at, status: s.status,
      confirmationStatus: s.confirmation_status as MemberScheduleEntry["confirmationStatus"],
      declineReason: s.decline_reason, respondedAt: s.responded_at,
      volunteerNotes: s.volunteer_notes,
      reminderCount: reminderByShiftId.get(s.id)?.reminder_count ?? 0,
      lastReminderAt: reminderByShiftId.get(s.id)?.last_reminder_at ?? null,
      volunteerName: s.full_name, volunteerEmail: s.email, volunteerPhone: s.phone,
    }));

    const runOfService: ServicePlanItem[] = runItemsResult.rows.map((item) => ({
      id: item.id,
      planId: item.plan_id,
      churchId: item.church_id,
      startsAt: item.starts_at,
      endsAt: item.ends_at,
      title: item.title,
      itemType: (item.item_type as ServicePlanItem["itemType"]) ?? "segment",
      leaderName: item.leader_name,
      notes: item.notes,
      attachmentUrl: item.attachment_url,
      sortOrder: item.sort_order,
      songKey: item.song_key ?? null,
      durationSeconds: item.duration_seconds ?? null,
      artist: item.artist ?? null,
    }));

    const positions = posResult.rows.map((pos) => {
      const posShifts = shifts.filter((s) => s.positionId === pos.id);
      return {
        id: pos.id, planId: pos.plan_id, churchId: pos.church_id,
        roleName: pos.role_name, quantityNeeded: pos.quantity_needed,
        ministryId: pos.ministry_id, sortOrder: pos.sort_order,
        shifts: posShifts,
        filled: posShifts.filter((s) => s.confirmationStatus !== "declined").length,
        pending: posShifts.filter((s) => s.confirmationStatus === "pending").length,
      };
    });

    return {
      plan: {
        id: plan.id, churchId: plan.church_id, eventId: plan.event_id,
        name: plan.name, serviceDate: plan.service_date, serviceTime: plan.service_time,
        serviceType: (plan.service_type as ServicePlanDetail["plan"]["serviceType"]) ?? "worship",
        scriptureReference: plan.scripture_reference,
        sermonTitle: plan.sermon_title,
        sermonSpeaker: plan.sermon_speaker,
        status: plan.status as ServicePlanDetail["plan"]["status"],
        notes: plan.notes, createdBy: plan.created_by, createdAt: plan.created_at,
      },
      runOfService,
      positions,
      unfilledCount: positions.reduce((sum, p) => sum + Math.max(0, p.quantityNeeded - p.filled), 0),
      confirmedCount: positions.reduce((sum, p) => sum + p.shifts.filter((s) => s.confirmationStatus === "confirmed").length, 0),
      pendingCount: positions.reduce((sum, p) => sum + p.pending, 0),
    };
  }

  // Supabase path
  const supabase = await createTenantServerClient();
  const { data: plan } = await supabase
    .from("service_plans").select("*").eq("id", planId).eq("church_id", churchId).single();
  if (!plan) return null;

  const [{ data: positions }, { data: shifts }, { data: runItems }] = await Promise.all([
    supabase.from("service_plan_positions").select("*").eq("plan_id", planId).order("sort_order"),
    supabase.from("volunteer_shifts").select("*, profiles(full_name, email, phone)")
      .eq("plan_id", planId).order("starts_at"),
    supabase.from("service_plan_items").select("*").eq("plan_id", planId).order("sort_order"),
  ]);

  const shiftIds = (shifts ?? []).map((shift) => shift.id);
  const reminderByShiftId = new Map<string, { reminder_count: number; last_reminder_at: string | null }>();
  if (shiftIds.length > 0) {
    const { data: reminders } = await supabase
      .from("volunteer_shift_reminders")
      .select("shift_id, sent_at")
      .eq("church_id", churchId)
      .in("shift_id", shiftIds);

    for (const reminder of reminders ?? []) {
      const current = reminderByShiftId.get(reminder.shift_id) ?? {
        reminder_count: 0,
        last_reminder_at: null,
      };

      reminderByShiftId.set(reminder.shift_id, {
        reminder_count: current.reminder_count + 1,
        last_reminder_at:
          !current.last_reminder_at || reminder.sent_at > current.last_reminder_at
            ? reminder.sent_at
            : current.last_reminder_at,
      });
    }
  }

  const mappedShifts = (shifts ?? []).map((s) => {
    const p = s.profiles as { full_name: string; email: string; phone: string } | null;
    const reminder = reminderByShiftId.get(s.id);
    return {
      id: s.id, churchId: s.church_id, eventId: s.event_id, planId: s.plan_id,
      positionId: s.position_id, assignedUserId: s.assigned_user_id,
      title: s.title, startsAt: s.starts_at, endsAt: s.ends_at, status: s.status,
      confirmationStatus: (s.confirmation_status ?? "pending") as MemberScheduleEntry["confirmationStatus"],
      declineReason: s.decline_reason ?? null, respondedAt: s.responded_at ?? null,
      volunteerNotes: s.volunteer_notes ?? null,
      reminderCount: reminder?.reminder_count ?? 0,
      lastReminderAt: reminder?.last_reminder_at ?? null,
      volunteerName: p?.full_name ?? null, volunteerEmail: p?.email ?? null, volunteerPhone: p?.phone ?? null,
    };
  });

  const mappedPositions = (positions ?? []).map((pos) => {
    const posShifts = mappedShifts.filter((s) => s.positionId === pos.id);
    return {
      id: pos.id, planId: pos.plan_id, churchId: pos.church_id,
      roleName: pos.role_name, quantityNeeded: pos.quantity_needed,
      ministryId: pos.ministry_id, sortOrder: pos.sort_order,
      shifts: posShifts,
      filled: posShifts.filter((s) => s.confirmationStatus !== "declined").length,
      pending: posShifts.filter((s) => s.confirmationStatus === "pending").length,
    };
  });

  const runOfService: ServicePlanItem[] = (runItems ?? []).map((item) => ({
    id: item.id,
    planId: item.plan_id,
    churchId: item.church_id,
    startsAt: item.starts_at ?? null,
    endsAt: item.ends_at ?? null,
    title: item.title,
    itemType: (item.item_type as ServicePlanItem["itemType"]) ?? "segment",
    leaderName: item.leader_name ?? null,
    notes: item.notes ?? null,
    attachmentUrl: item.attachment_url ?? null,
    sortOrder: item.sort_order,
    songKey: item.song_key ?? null,
    durationSeconds: item.duration_seconds ?? null,
    artist: item.artist ?? null,
  }));

  return {
    plan: {
      id: plan.id, churchId: plan.church_id, eventId: plan.event_id,
      name: plan.name, serviceDate: plan.service_date, serviceTime: plan.service_time,
      serviceType: (plan.service_type as ServicePlanDetail["plan"]["serviceType"]) ?? "worship",
      scriptureReference: plan.scripture_reference ?? null,
      sermonTitle: plan.sermon_title ?? null,
      sermonSpeaker: plan.sermon_speaker ?? null,
      status: plan.status as ServicePlanDetail["plan"]["status"],
      notes: plan.notes, createdBy: plan.created_by, createdAt: plan.created_at,
    },
    runOfService,
    positions: mappedPositions,
    unfilledCount: mappedPositions.reduce((sum, p) => sum + Math.max(0, p.quantityNeeded - p.filled), 0),
    confirmedCount: mappedPositions.reduce((sum, p) => sum + p.shifts.filter((s) => s.confirmationStatus === "confirmed").length, 0),
    pendingCount: mappedPositions.reduce((sum, p) => sum + p.pending, 0),
  };
}

// ── Volunteer pool (for assignment picker) ───────────────────

export async function getVolunteerPool(
  session: ChurchAppSession,
  serviceDate: string,
): Promise<VolunteerPoolEntry[]> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") return [];
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      profile_id: string; full_name: string; email: string | null; phone: string | null;
      skills: string[]; is_blocked: boolean; recent_shift_count: number; total_hours: number;
    }>(
      `select
         p.id                                    as profile_id,
         p.full_name,
         p.email,
         p.phone,
         coalesce(vp.skills, '{}')               as skills,
         exists (
           select 1 from public.volunteer_blocked_dates vbd
           where vbd.profile_id = p.id and vbd.blocked_date = $2::date
         )                                       as is_blocked,
         count(vs.id) filter (
           where vs.starts_at >= now() - interval '30 days'
         )::int                                  as recent_shift_count,
         coalesce(sum(vhl.hours), 0)             as total_hours
       from public.profiles p
       join public.church_memberships cm on cm.user_id = p.id and cm.church_id = $1
       left join public.volunteer_profiles vp on vp.user_id = p.id and vp.church_id = $1
       left join public.volunteer_shifts vs on vs.assigned_user_id = p.id and vs.church_id = $1
       left join public.volunteer_hours_log vhl on vhl.profile_id = p.id and vhl.church_id = $1
       group by p.id, p.full_name, p.email, p.phone, vp.skills
       order by p.full_name`,
      [churchId, serviceDate],
    );
    return result.rows.map((r) => ({
      profileId: r.profile_id, fullName: r.full_name, email: r.email, phone: r.phone,
      skills: r.skills, isBlocked: r.is_blocked,
      recentShiftCount: r.recent_shift_count, totalHours: Number(r.total_hours),
    }));
  }

  const supabase = await createTenantServerClient();
  const { data: members } = await supabase
    .from("church_memberships")
    .select("profile_id, profiles(id, full_name, email, phone), volunteer_profiles(skills)")
    .eq("church_id", churchId);

  return (members ?? []).map((m) => {
    const p = (m.profiles as unknown) as { id: string; full_name: string; email: string | null; phone: string | null } | null;
    const vp = (m.volunteer_profiles as unknown) as { skills: string[] } | null;
    return {
      profileId: p?.id ?? m.profile_id, fullName: p?.full_name ?? "Unknown",
      email: p?.email ?? null, phone: p?.phone ?? null,
      skills: vp?.skills ?? [], isBlocked: false,
      recentShiftCount: 0, totalHours: 0,
    };
  });
}

// ── Volunteer directory ──────────────────────────────────────

export async function getVolunteerDirectory(
  session: ChurchAppSession,
): Promise<VolunteerDirectoryEntry[]> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") return [];
  const churchId = session.appContext.church.id;
  const year = new Date().getFullYear();

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      profile_id: string; full_name: string; email: string | null; phone: string | null;
      skills: string[]; total_hours: number; shifts_this_year: number;
      last_served_date: string | null; background_check_date: string | null;
    }>(
      `select
         p.id                                                as profile_id,
         p.full_name,
         p.email,
         p.phone,
         coalesce(vp.skills, '{}')                          as skills,
         coalesce(sum(vhl.hours) filter (where extract(year from vhl.service_date) = $2), 0) as total_hours,
         count(vs.id) filter (
           where extract(year from vs.starts_at) = $2
           and vs.confirmation_status = 'confirmed'
         )::int                                             as shifts_this_year,
         max(vs.starts_at)::text                            as last_served_date,
         p.safety_clearance_date::text                      as background_check_date
       from public.profiles p
       join public.church_memberships cm on cm.user_id = p.id and cm.church_id = $1
       left join public.volunteer_profiles vp on vp.user_id = p.id and vp.church_id = $1
       left join public.volunteer_shifts vs on vs.assigned_user_id = p.id and vs.church_id = $1
       left join public.volunteer_hours_log vhl on vhl.profile_id = p.id and vhl.church_id = $1
       where (vp.id is not null or count(vs.id) over () > 0)
       group by p.id, p.full_name, p.email, p.phone, vp.skills, p.safety_clearance_date
       having count(vs.id) > 0 or vp.id is not null
       order by p.full_name`,
      [churchId, year],
    );
    return result.rows.map((r) => ({
      profileId: r.profile_id, fullName: r.full_name, email: r.email, phone: r.phone,
      skills: r.skills, totalHours: Number(r.total_hours), shiftsThisYear: r.shifts_this_year,
      lastServedDate: r.last_served_date, backgroundCheckDate: r.background_check_date,
    }));
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, safety_clearance_date, volunteer_profiles(skills), volunteer_shifts(id, starts_at, confirmation_status), volunteer_hours_log(hours, service_date)")
    .eq("church_memberships.church_id", churchId);

  return (data ?? []).map((p) => {
    const shifts = (p.volunteer_shifts ?? []) as { starts_at: string; confirmation_status: string }[];
    const hours = (p.volunteer_hours_log ?? []) as { hours: number; service_date: string }[];
    const vp = (p.volunteer_profiles as unknown) as { skills: string[] } | null;
    const yearShifts = shifts.filter((s) => s.starts_at.startsWith(String(year)) && s.confirmation_status === "confirmed");
    const totalHours = hours.filter((h) => h.service_date.startsWith(String(year))).reduce((s, h) => s + Number(h.hours), 0);
    const lastShift = shifts.sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0];
    return {
      profileId: p.id, fullName: p.full_name, email: p.email ?? null, phone: p.phone ?? null,
      skills: vp?.skills ?? [], totalHours, shiftsThisYear: yearShifts.length,
      lastServedDate: lastShift?.starts_at ?? null,
      backgroundCheckDate: p.safety_clearance_date ?? null,
    };
  });
}

// ── Templates ────────────────────────────────────────────────

export async function getServicePlanTemplates(
  session: ChurchAppSession,
): Promise<ServicePlanTemplate[]> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") return [];
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string; name: string; positions: string; is_active: boolean;
    }>(
      `select id, name, positions, is_active
       from public.service_plan_templates
       where church_id = $1 and is_active = true
       order by name`,
      [churchId],
    );
    return result.rows.map((r) => ({
      id: r.id, name: r.name, isActive: r.is_active,
      positions: typeof r.positions === "string" ? JSON.parse(r.positions) : r.positions,
    }));
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase.from("service_plan_templates")
    .select("id, name, positions, is_active").eq("church_id", churchId).eq("is_active", true);
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, isActive: r.is_active, positions: r.positions }));
}

// ── Member's own schedule ────────────────────────────────────

export async function getMemberSchedule(
  session: ChurchAppSession,
): Promise<MemberScheduleEntry[]> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") return [];
  const profileId = session.profile.id;
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      shift_id: string; plan_name: string; service_date: string;
      role_name: string; starts_at: string; ends_at: string; confirmation_status: string;
    }>(
      `select
         vs.id as shift_id,
         sp.name as plan_name,
         sp.service_date,
         vs.title as role_name,
         vs.starts_at,
         vs.ends_at,
         vs.confirmation_status
       from public.volunteer_shifts vs
       join public.service_plans sp on sp.id = vs.plan_id
       where vs.assigned_user_id = $1
         and vs.church_id = $2
         and sp.service_date >= current_date
       order by sp.service_date, vs.starts_at`,
      [profileId, churchId],
    );
    return result.rows.map((r) => ({
      shiftId: r.shift_id, planName: r.plan_name, serviceDate: r.service_date,
      roleName: r.role_name, startsAt: r.starts_at, endsAt: r.ends_at,
      confirmationStatus: r.confirmation_status as MemberScheduleEntry["confirmationStatus"],
    }));
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("volunteer_shifts")
    .select("id, title, starts_at, ends_at, confirmation_status, service_plans(name, service_date)")
    .eq("assigned_user_id", profileId)
    .eq("church_id", churchId)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at");

  return (data ?? []).map((s) => {
    const sp = (s.service_plans as unknown) as { name: string; service_date: string } | null;
    return {
      shiftId: s.id, planName: sp?.name ?? "Service", serviceDate: sp?.service_date ?? "",
      roleName: s.title, startsAt: s.starts_at, endsAt: s.ends_at,
      confirmationStatus: (s.confirmation_status ?? "pending") as MemberScheduleEntry["confirmationStatus"],
    };
  });
}
