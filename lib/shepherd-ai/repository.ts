import {
  createTenantAdminClient,
  hasTenantAdminBackendEnv,
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import type {
  OpsSignal,
  ShepherdAiSuggestion,
  ShepherdAiUrgency,
  ShepherdAiWorkflowCode,
} from "@/lib/shepherd-ai/types";
import type { EntityMetrics } from "@/lib/shepherd-ai/signal-aggregator";

function dayStart(daysAgo: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date;
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function computeDecline(recent: number, baseline: number, recentWeeks: number, baselineWeeks: number) {
  const recentRate = recent / Math.max(1, recentWeeks);
  const baselineRate = baseline / Math.max(1, baselineWeeks);
  if (baselineRate <= 0) return 0;
  return clampUnit((baselineRate - recentRate) / baselineRate);
}

function normalizeRow(row: {
  entity_type: "member" | "visitor" | "volunteer";
  entity_id: string;
  display_name: string;
  attendance_recent: number;
  attendance_baseline: number;
  service_recent: number;
  service_baseline: number;
  volunteer_streak_weeks: number;
  recent_outreach_at: string | null;
  first_visit_date: string | null;
  has_follow_up: boolean;
  group_recent: number;
  group_baseline: number;
  communication_recent: number;
}): EntityMetrics {
  const attendanceDecline = computeDecline(row.attendance_recent, row.attendance_baseline, 4, 8);
  const serviceDrop = computeDecline(row.service_recent, row.service_baseline, 4, 8);
  const groupParticipationDecline = computeDecline(row.group_recent, row.group_baseline, 4, 8);
  const attendanceConsistency = clampUnit(row.attendance_baseline / 8);
  const volunteerLoad = clampUnit(row.service_recent / 6);
  const volunteerStreak = clampUnit(row.volunteer_streak_weeks / 6);
  const communicationAbsence = row.communication_recent > 0 ? 0 : 1;

  let firstTimeVisitorGap = 0;
  if (row.entity_type === "visitor" && row.first_visit_date && !row.has_follow_up) {
    const elapsedMs = Date.now() - new Date(row.first_visit_date).getTime();
    const elapsedHours = elapsedMs / (1000 * 60 * 60);
    firstTimeVisitorGap = clampUnit(elapsedHours / 72);
  }

  return {
    entityType: row.entity_type,
    entityId: row.entity_id,
    displayName: row.display_name,
    firstVisitDate: row.first_visit_date,
    hasFollowUp: row.has_follow_up,
    recentOutreachAt: row.recent_outreach_at,
    contextPayload: {
      attendanceRecent: row.attendance_recent,
      attendanceBaseline: row.attendance_baseline,
      serviceRecent: row.service_recent,
      serviceBaseline: row.service_baseline,
      groupRecent: row.group_recent,
      groupBaseline: row.group_baseline,
      communicationRecent: row.communication_recent,
    },
    attendanceDecline,
    attendanceConsistency,
    serviceDrop,
    volunteerLoad,
    volunteerStreak,
    firstTimeVisitorGap,
    groupParticipationDecline,
    communicationAbsence,
  };
}

async function loadRowsWithSql(tenantId: string) {
  const recentStart = dayStart(28).toISOString();
  const baselineStart = dayStart(84).toISOString();
  const baselineEnd = dayStart(28).toISOString();
  const commStart = dayStart(21).toISOString();

  const members = await queryTenantLocalDb<{
    entity_type: "member" | "volunteer";
    entity_id: string;
    display_name: string;
    attendance_recent: number;
    attendance_baseline: number;
    service_recent: number;
    service_baseline: number;
    volunteer_streak_weeks: number;
    recent_outreach_at: string | null;
    first_visit_date: string | null;
    has_follow_up: boolean;
    group_recent: number;
    group_baseline: number;
    communication_recent: number;
  }>(
    `select
        case when coalesce(vp.id::text, '') <> '' then 'volunteer' else 'member' end as entity_type,
        p.id as entity_id,
        coalesce(p.full_name, 'Member') as display_name,
        coalesce((
          select count(*)::int from public.attendance a
          where a.profile_id = p.id and a.church_id = $1 and a.status = 'present' and a.checked_in_at >= $2
        ), 0) as attendance_recent,
        coalesce((
          select count(*)::int from public.attendance a
          where a.profile_id = p.id and a.church_id = $1 and a.status = 'present' and a.checked_in_at >= $3 and a.checked_in_at < $4
        ), 0) as attendance_baseline,
        coalesce((
          select count(*)::int from public.volunteer_shifts vs
          where vs.assigned_user_id = p.id and vs.church_id = $1 and vs.starts_at >= $2 and vs.confirmation_status in ('confirmed', 'pending')
        ), 0) as service_recent,
        coalesce((
          select count(*)::int from public.volunteer_shifts vs
          where vs.assigned_user_id = p.id and vs.church_id = $1 and vs.starts_at >= $3 and vs.starts_at < $4 and vs.confirmation_status in ('confirmed', 'pending')
        ), 0) as service_baseline,
        coalesce((
          select count(distinct date_trunc('week', vs.starts_at))::int
          from public.volunteer_shifts vs
          where vs.assigned_user_id = p.id and vs.church_id = $1 and vs.starts_at >= $2 and vs.confirmation_status in ('confirmed', 'pending')
        ), 0) as volunteer_streak_weeks,
        (
          select max(cl.created_at)::text
          from public.communication_logs cl
          where cl.church_id = $1 and cl.recipient_id = p.id and cl.status in ('sent', 'delivered')
        ) as recent_outreach_at,
        null::text as first_visit_date,
        false as has_follow_up,
        coalesce((
          select count(*)::int from public.group_attendance ga
          where ga.profile_id = p.id and ga.church_id = $1 and ga.status = 'present' and ga.created_at >= $2
        ), 0) as group_recent,
        coalesce((
          select count(*)::int from public.group_attendance ga
          where ga.profile_id = p.id and ga.church_id = $1 and ga.status = 'present' and ga.created_at >= $3 and ga.created_at < $4
        ), 0) as group_baseline,
        coalesce((
          select count(*)::int from public.communication_logs cl
          where cl.church_id = $1 and cl.recipient_id = p.id and cl.created_at >= $5
        ), 0) as communication_recent
      from public.profiles p
      join public.church_memberships cm on cm.user_id = p.id and cm.church_id = $1 and cm.is_active = true
      left join public.volunteer_profiles vp on vp.user_id = p.id and vp.church_id = $1
      where p.church_id = $1 and p.merged_at is null`,
    [tenantId, recentStart, baselineStart, baselineEnd, commStart],
  );

  const visitors = await queryTenantLocalDb<{
    entity_type: "visitor";
    entity_id: string;
    display_name: string;
    attendance_recent: number;
    attendance_baseline: number;
    service_recent: number;
    service_baseline: number;
    volunteer_streak_weeks: number;
    recent_outreach_at: string | null;
    first_visit_date: string | null;
    has_follow_up: boolean;
    group_recent: number;
    group_baseline: number;
    communication_recent: number;
  }>(
    `select
        'visitor' as entity_type,
        v.id as entity_id,
        v.full_name as display_name,
        0::int as attendance_recent,
        0::int as attendance_baseline,
        0::int as service_recent,
        0::int as service_baseline,
        0::int as volunteer_streak_weeks,
        null::text as recent_outreach_at,
        v.visit_date::text as first_visit_date,
        v.workflow_stage <> 'new' as has_follow_up,
        0::int as group_recent,
        0::int as group_baseline,
        0::int as communication_recent
      from public.first_time_visitors v
      where v.church_id = $1 and v.visit_date >= current_date - interval '10 days'`,
    [tenantId],
  );

  return [...members.rows, ...visitors.rows];
}

async function loadRowsWithSupabase(tenantId: string, useAdminClient = false) {
  const supabase = useAdminClient && hasTenantAdminBackendEnv()
    ? createTenantAdminClient()
    : await createTenantServerClient();
  const recentStart = dayStart(28).toISOString();
  const baselineStart = dayStart(84).toISOString();
  const baselineEnd = dayStart(28).toISOString();
  const commStart = dayStart(21).toISOString();

  const [{ data: profiles }, { data: attendanceRows }, { data: shifts }, { data: groupAttendance }, { data: comms }, { data: visitors }, { data: volunteerProfiles }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("church_id", tenantId)
        .is("merged_at", null),
      supabase
        .from("attendance")
        .select("profile_id, checked_in_at, status")
        .eq("church_id", tenantId)
        .eq("status", "present")
        .gte("checked_in_at", baselineStart),
      supabase
        .from("volunteer_shifts")
        .select("assigned_user_id, starts_at, confirmation_status")
        .eq("church_id", tenantId)
        .in("confirmation_status", ["confirmed", "pending"])
        .gte("starts_at", baselineStart),
      supabase
        .from("group_attendance")
        .select("profile_id, created_at, status")
        .eq("church_id", tenantId)
        .eq("status", "present")
        .gte("created_at", baselineStart),
      supabase
        .from("communication_logs")
        .select("recipient_id, created_at, status")
        .eq("church_id", tenantId)
        .in("status", ["queued", "sent", "delivered", "failed", "bounced"])
        .gte("created_at", commStart),
      supabase
        .from("first_time_visitors")
        .select("id, full_name, visit_date, workflow_stage")
        .eq("church_id", tenantId)
        .gte("visit_date", dayStart(10).toISOString().slice(0, 10)),
      supabase
        .from("volunteer_profiles")
        .select("user_id")
        .eq("church_id", tenantId),
    ]);

  const volunteerSet = new Set((volunteerProfiles ?? []).map((row) => row.user_id));

  const rows = (profiles ?? []).map((profile) => {
    const pAttendance = (attendanceRows ?? []).filter((row) => row.profile_id === profile.id);
    const pShifts = (shifts ?? []).filter((row) => row.assigned_user_id === profile.id);
    const pGroupAttendance = (groupAttendance ?? []).filter((row) => row.profile_id === profile.id);
    const pComms = (comms ?? []).filter((row) => row.recipient_id === profile.id);

    const attendanceRecent = pAttendance.filter((row) => row.checked_in_at >= recentStart).length;
    const attendanceBaseline = pAttendance.filter(
      (row) => row.checked_in_at >= baselineStart && row.checked_in_at < baselineEnd,
    ).length;

    const serviceRecent = pShifts.filter((row) => row.starts_at >= recentStart).length;
    const serviceBaseline = pShifts.filter(
      (row) => row.starts_at >= baselineStart && row.starts_at < baselineEnd,
    ).length;

    const streakWeeks = new Set(
      pShifts
        .filter((row) => row.starts_at >= recentStart)
        .map((row) => row.starts_at.slice(0, 10)),
    ).size;

    const groupRecent = pGroupAttendance.filter((row) => row.created_at >= recentStart).length;
    const groupBaseline = pGroupAttendance.filter(
      (row) => row.created_at >= baselineStart && row.created_at < baselineEnd,
    ).length;

    return {
      entity_type: volunteerSet.has(profile.id) ? ("volunteer" as const) : ("member" as const),
      entity_id: profile.id,
      display_name: profile.full_name ?? "Member",
      attendance_recent: attendanceRecent,
      attendance_baseline: attendanceBaseline,
      service_recent: serviceRecent,
      service_baseline: serviceBaseline,
      volunteer_streak_weeks: streakWeeks,
      recent_outreach_at: pComms.length ? pComms[0]?.created_at ?? null : null,
      first_visit_date: null,
      has_follow_up: false,
      group_recent: groupRecent,
      group_baseline: groupBaseline,
      communication_recent: pComms.length,
    };
  });

  const visitorRows = (visitors ?? []).map((visitor) => ({
    entity_type: "visitor" as const,
    entity_id: visitor.id,
    display_name: visitor.full_name,
    attendance_recent: 0,
    attendance_baseline: 0,
    service_recent: 0,
    service_baseline: 0,
    volunteer_streak_weeks: 0,
    recent_outreach_at: null,
    first_visit_date: visitor.visit_date,
    has_follow_up: visitor.workflow_stage !== "new",
    group_recent: 0,
    group_baseline: 0,
    communication_recent: 0,
  }));

  return [...rows, ...visitorRows];
}

export class ShepherdAiRepository {
  async listEntityMetrics(
    tenantId: string,
    options?: { useAdminClient?: boolean },
  ): Promise<EntityMetrics[]> {
    const rows = shouldUseLocalTenantFallback()
      ? await loadRowsWithSql(tenantId)
      : await loadRowsWithSupabase(tenantId, options?.useAdminClient ?? false);

    return rows.map(normalizeRow);
  }

  async persistSignals(
    tenantId: string,
    signals: OpsSignal[],
    options?: { useAdminClient?: boolean },
  ) {
    if (!signals.length) return;

    if (shouldUseLocalTenantFallback()) {
      for (const signal of signals) {
        await queryTenantLocalDb(
          `insert into public.ai_signals
            (tenant_id, entity_type, entity_id, signal_type, signal_value, signal_window, signal_payload_json, detected_at)
           values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
          [
            tenantId,
            signal.entityType,
            signal.entityId,
            signal.signalType,
            signal.signalValue,
            signal.signalWindow,
            JSON.stringify(signal.signalPayload),
            signal.detectedAt,
          ],
        );
      }
      return;
    }

    const supabase = options?.useAdminClient && hasTenantAdminBackendEnv()
      ? createTenantAdminClient()
      : await createTenantServerClient();
    await supabase.from("ai_signals").insert(
      signals.map((signal) => ({
        tenant_id: tenantId,
        entity_type: signal.entityType,
        entity_id: signal.entityId,
        signal_type: signal.signalType,
        signal_value: signal.signalValue,
        signal_window: signal.signalWindow,
        signal_payload_json: signal.signalPayload,
        detected_at: signal.detectedAt,
      })),
    );
  }

  async persistSuggestions(
    tenantId: string,
    suggestions: ShepherdAiSuggestion[],
    options?: { useAdminClient?: boolean },
  ) {
    if (!suggestions.length) return [] as string[];

    const createdIds: string[] = [];

    if (shouldUseLocalTenantFallback()) {
      for (const suggestion of suggestions) {
        const existing = await queryTenantLocalDb<{ id: string }>(
          `select id
           from public.ai_suggestions
           where tenant_id = $1
             and entity_type = $2
             and entity_id = $3
             and workflow_code = $4
             and status in ('suggested', 'deferred')
             and generated_at >= now() - interval '7 days'
           limit 1`,
          [tenantId, suggestion.entityType, suggestion.entityId, suggestion.workflowCode],
        );

        if (existing.rows[0]) continue;

        const created = await queryTenantLocalDb<{ id: string }>(
          `insert into public.ai_suggestions
            (tenant_id, product_area, workflow_type, workflow_code, entity_type, entity_id,
             title, summary, confidence_score, urgency, explanation_json,
             spiritual_support_json, boundary_note, status, generated_at)
           values ($1,'ops','ministry',$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13)
           returning id`,
          [
            tenantId,
            suggestion.workflowCode,
            suggestion.entityType,
            suggestion.entityId,
            suggestion.title,
            suggestion.summary,
            suggestion.confidenceScore,
            suggestion.urgency,
            JSON.stringify({
              ...suggestion.explanation,
              suggestedActions: suggestion.suggestedActions,
              messageDraft: suggestion.messageDraft ?? null,
            }),
            suggestion.spiritualSupport ? JSON.stringify(suggestion.spiritualSupport) : null,
            suggestion.boundaryNote,
            suggestion.status,
            suggestion.generatedAt,
          ],
        );
        if (created.rows[0]) createdIds.push(created.rows[0].id);
      }

      return createdIds;
    }

    const supabase = options?.useAdminClient && hasTenantAdminBackendEnv()
      ? createTenantAdminClient()
      : await createTenantServerClient();
    for (const suggestion of suggestions) {
      const { data: existing } = await supabase
        .from("ai_suggestions")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("entity_type", suggestion.entityType)
        .eq("entity_id", suggestion.entityId)
        .eq("workflow_code", suggestion.workflowCode)
        .in("status", ["suggested", "deferred"])
        .gte("generated_at", dayStart(7).toISOString())
        .limit(1);

      if (existing?.length) continue;

      const { data: inserted } = await supabase
        .from("ai_suggestions")
        .insert({
          tenant_id: tenantId,
          product_area: "ops",
          workflow_type: "ministry",
          workflow_code: suggestion.workflowCode,
          entity_type: suggestion.entityType,
          entity_id: suggestion.entityId,
          title: suggestion.title,
          summary: suggestion.summary,
          confidence_score: suggestion.confidenceScore,
          urgency: suggestion.urgency,
          explanation_json: {
            ...suggestion.explanation,
            suggestedActions: suggestion.suggestedActions,
            messageDraft: suggestion.messageDraft ?? null,
          },
          spiritual_support_json: suggestion.spiritualSupport ?? null,
          boundary_note: suggestion.boundaryNote,
          status: suggestion.status,
          generated_at: suggestion.generatedAt,
        })
        .select("id")
        .single();

      if (inserted?.id) createdIds.push(inserted.id);
    }

    return createdIds;
  }

  async listSuggestionQueue(
    tenantId: string,
    filters?: {
      urgency?: ShepherdAiUrgency | "all";
      status?: string | "all";
      assigneeId?: string | "all";
      workflowCode?: ShepherdAiWorkflowCode | "all";
    },
  ) {
    if (shouldUseLocalTenantFallback()) {
      const where: string[] = ["s.tenant_id = $1"];
      const values: unknown[] = [tenantId];
      let index = 2;

      if (filters?.urgency && filters.urgency !== "all") {
        where.push(`s.urgency = $${index++}`);
        values.push(filters.urgency);
      }
      if (filters?.status && filters.status !== "all") {
        where.push(`coalesce(w.status, s.status) = $${index++}`);
        values.push(filters.status);
      }
      if (filters?.workflowCode && filters.workflowCode !== "all") {
        where.push(`s.workflow_code = $${index++}`);
        values.push(filters.workflowCode);
      }
      if (filters?.assigneeId && filters.assigneeId !== "all") {
        where.push(`w.assigned_to_user_id = $${index++}`);
        values.push(filters.assigneeId);
      }

      const query = `select
          s.id,
          s.workflow_code,
          s.entity_type,
          s.entity_id,
          s.title,
          s.summary,
          s.confidence_score,
          s.urgency,
          s.explanation_json,
          s.boundary_note,
          s.status as suggestion_status,
          s.generated_at,
          w.id as workflow_id,
          w.status as workflow_status,
          w.assigned_to_user_id,
          assignee.full_name as assignee_name
        from public.ai_suggestions s
        left join public.workflows w on w.suggestion_id = s.id
        left join public.profiles assignee on assignee.id = w.assigned_to_user_id
        where ${where.join(" and ")}
        order by
          case s.urgency when 'high' then 1 when 'medium' then 2 else 3 end,
          s.generated_at desc`;

      const rows = await queryTenantLocalDb(query, values);
      return rows.rows;
    }

    const supabase = await createTenantServerClient();
    let query = supabase
      .from("ai_suggestions")
      .select(
        "id, workflow_code, entity_type, entity_id, title, summary, confidence_score, urgency, explanation_json, boundary_note, status, generated_at, workflows(id, status, assigned_to_user_id, assignee:profiles!assigned_to_user_id(full_name))",
      )
      .eq("tenant_id", tenantId)
      .order("generated_at", { ascending: false });

    if (filters?.urgency && filters.urgency !== "all") {
      query = query.eq("urgency", filters.urgency);
    }
    if (filters?.workflowCode && filters.workflowCode !== "all") {
      query = query.eq("workflow_code", filters.workflowCode);
    }

    const { data } = await query;
    const mapped = (data ?? []).map((row) => {
      const workflow = (
        Array.isArray(row.workflows) ? row.workflows[0] : row.workflows
      ) as
        | {
            id?: string | null;
            status?: string | null;
            assigned_to_user_id?: string | null;
            assignee?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null;
          }
        | null;

      const assigneeName = Array.isArray(workflow?.assignee)
        ? (workflow?.assignee[0]?.full_name ?? null)
        : (workflow?.assignee?.full_name ?? null);

      return {
        id: row.id,
        workflow_code: row.workflow_code,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        title: row.title,
        summary: row.summary,
        confidence_score: row.confidence_score,
        urgency: row.urgency,
        explanation_json: row.explanation_json,
        boundary_note: row.boundary_note,
        suggestion_status: row.status,
        generated_at: row.generated_at,
        workflow_id: workflow?.id ?? null,
        workflow_status: workflow?.status ?? null,
        assigned_to_user_id: workflow?.assigned_to_user_id ?? null,
        assignee_name: assigneeName,
      };
    });

    return mapped.filter((row) => {
      if (filters?.status && filters.status !== "all") {
        const combined = row.workflow_status ?? row.suggestion_status;
        if (combined !== filters.status) return false;
      }
      if (filters?.assigneeId && filters.assigneeId !== "all") {
        if (row.assigned_to_user_id !== filters.assigneeId) return false;
      }
      return true;
    });
  }
}
