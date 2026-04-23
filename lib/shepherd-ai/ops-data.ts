import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import { ShepherdAiRepository } from "@/lib/shepherd-ai/repository";

export type ShepherdWorkflowQueueRow = {
  id: string;
  workflowCode: string;
  entityType: string;
  entityId: string;
  title: string;
  summary: string;
  confidenceScore: number;
  urgency: string;
  explanation: Record<string, unknown>;
  boundaryNote: string;
  suggestionStatus: string;
  generatedAt: string;
  workflowId: string | null;
  workflowStatus: string | null;
  assignedToUserId: string | null;
  assigneeName: string | null;
};

export type ShepherdDashboardWidgetData = {
  pendingCount: number;
  highUrgencyCount: number;
  byWorkflowCode: Array<{ workflowCode: string; count: number }>;
  latestSuggestions: ShepherdWorkflowQueueRow[];
};

export type ShepherdAssignee = {
  id: string;
  fullName: string;
};

const repository = new ShepherdAiRepository();

function emptyWidgetData(): ShepherdDashboardWidgetData {
  return {
    pendingCount: 0,
    highUrgencyCount: 0,
    byWorkflowCode: [],
    latestSuggestions: [],
  };
}

function mapQueueRows(rows: Array<Record<string, unknown>>): ShepherdWorkflowQueueRow[] {
  return rows.map((row) => ({
    id: String(row.id),
    workflowCode: String(row.workflow_code),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    title: String(row.title),
    summary: String(row.summary),
    confidenceScore: Number(row.confidence_score),
    urgency: String(row.urgency),
    explanation: (row.explanation_json as Record<string, unknown>) ?? {},
    boundaryNote: String(row.boundary_note),
    suggestionStatus: String(row.suggestion_status),
    generatedAt: String(row.generated_at),
    workflowId: row.workflow_id ? String(row.workflow_id) : null,
    workflowStatus: row.workflow_status ? String(row.workflow_status) : null,
    assignedToUserId: row.assigned_to_user_id ? String(row.assigned_to_user_id) : null,
    assigneeName: row.assignee_name ? String(row.assignee_name) : null,
  }));
}

export async function getShepherdAiDashboardWidgetData(
  session: ChurchAppSession,
): Promise<ShepherdDashboardWidgetData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return emptyWidgetData();
  }

  const tenantId = session.appContext.church.id;
  const rows = await repository.listSuggestionQueue(tenantId, { status: "all" });
  const queueRows = mapQueueRows(rows as Array<Record<string, unknown>>);

  const pending = queueRows.filter((row) =>
    ["suggested", "open", "assigned", "deferred"].includes(
      row.workflowStatus ?? row.suggestionStatus,
    ),
  );

  const grouped = new Map<string, number>();
  for (const row of pending) {
    grouped.set(row.workflowCode, (grouped.get(row.workflowCode) ?? 0) + 1);
  }

  return {
    pendingCount: pending.length,
    highUrgencyCount: pending.filter((row) => row.urgency === "high").length,
    byWorkflowCode: Array.from(grouped.entries()).map(([workflowCode, count]) => ({
      workflowCode,
      count,
    })),
    latestSuggestions: pending.slice(0, 5),
  };
}

export async function getShepherdAiWorkflowQueueData(
  session: ChurchAppSession,
  filters?: {
    urgency?: "all" | "low" | "medium" | "high";
    status?: "all" | "suggested" | "open" | "assigned" | "deferred" | "dismissed" | "completed";
    assigneeId?: "all" | string;
    workflowCode?:
      | "all"
      | "reconnect_inactive_member"
      | "volunteer_fatigue"
      | "first_time_visitor_follow_up"
      | "member_disengagement_trend";
  },
) {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return {
      queue: [] as ShepherdWorkflowQueueRow[],
      assignees: [] as ShepherdAssignee[],
    };
  }

  const tenantId = session.appContext.church.id;
  const rows = await repository.listSuggestionQueue(tenantId, filters);
  const queue = mapQueueRows(rows as Array<Record<string, unknown>>);

  const assignees = await getWorkflowAssignees(session);

  return { queue, assignees };
}

export async function getWorkflowAssignees(session: ChurchAppSession): Promise<ShepherdAssignee[]> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") return [];
  const tenantId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const rows = await queryTenantLocalDb<{ id: string; full_name: string }>(
      `select p.id, p.full_name
       from public.profiles p
       join public.church_memberships cm on cm.user_id = p.id and cm.church_id = $1 and cm.is_active = true
       where p.church_id = $1 and p.merged_at is null
       order by p.full_name`,
      [tenantId],
    );

    return rows.rows.map((row) => ({ id: row.id, fullName: row.full_name }));
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("church_id", tenantId)
    .is("merged_at", null)
    .order("full_name");

  return (data ?? []).map((row) => ({ id: row.id, fullName: row.full_name }));
}

export async function getMemberShepherdInsights(
  session: ChurchAppSession,
  memberIds: string[],
): Promise<Map<string, ShepherdWorkflowQueueRow[]>> {
  const result = new Map<string, ShepherdWorkflowQueueRow[]>();
  if (!memberIds.length || !hasTenantBackendEnv() || session.source !== "supabase") {
    return result;
  }

  const tenantId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const rows = await queryTenantLocalDb<{
      id: string;
      workflow_code: string;
      entity_type: string;
      entity_id: string;
      title: string;
      summary: string;
      confidence_score: number;
      urgency: string;
      explanation_json: Record<string, unknown>;
      boundary_note: string;
      status: string;
      generated_at: string;
    }>(
      `select id, workflow_code, entity_type, entity_id, title, summary,
              confidence_score, urgency, explanation_json, boundary_note, status, generated_at
       from public.ai_suggestions
       where tenant_id = $1
         and entity_type = 'member'
         and entity_id = any($2::uuid[])
         and status in ('suggested', 'deferred', 'promoted')
       order by generated_at desc`,
      [tenantId, memberIds],
    );

    for (const row of rows.rows) {
      const entry: ShepherdWorkflowQueueRow = {
        id: row.id,
        workflowCode: row.workflow_code,
        entityType: row.entity_type,
        entityId: row.entity_id,
        title: row.title,
        summary: row.summary,
        confidenceScore: Number(row.confidence_score),
        urgency: row.urgency,
        explanation: row.explanation_json,
        boundaryNote: row.boundary_note,
        suggestionStatus: row.status,
        generatedAt: row.generated_at,
        workflowId: null,
        workflowStatus: null,
        assignedToUserId: null,
        assigneeName: null,
      };
      result.set(entry.entityId, [...(result.get(entry.entityId) ?? []), entry]);
    }

    return result;
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("ai_suggestions")
    .select(
      "id, workflow_code, entity_type, entity_id, title, summary, confidence_score, urgency, explanation_json, boundary_note, status, generated_at",
    )
    .eq("tenant_id", tenantId)
    .eq("entity_type", "member")
    .in("entity_id", memberIds)
    .in("status", ["suggested", "deferred", "promoted"])
    .order("generated_at", { ascending: false });

  for (const row of data ?? []) {
    const entry: ShepherdWorkflowQueueRow = {
      id: row.id,
      workflowCode: row.workflow_code,
      entityType: row.entity_type,
      entityId: row.entity_id,
      title: row.title,
      summary: row.summary,
      confidenceScore: Number(row.confidence_score),
      urgency: row.urgency,
      explanation: (row.explanation_json as Record<string, unknown>) ?? {},
      boundaryNote: row.boundary_note,
      suggestionStatus: row.status,
      generatedAt: row.generated_at,
      workflowId: null,
      workflowStatus: null,
      assignedToUserId: null,
      assigneeName: null,
    };
    result.set(entry.entityId, [...(result.get(entry.entityId) ?? []), entry]);
  }

  return result;
}
