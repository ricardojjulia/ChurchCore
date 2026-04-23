import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import type {
  CreateWorkflowInput,
  MinistryWorkflowStatus,
  RecordFeedbackInput,
} from "@/lib/ministry-workflows/types";

async function insertWorkflowAction(
  workflowId: string,
  actionType: string,
  payload: Record<string, unknown>,
  status: "pending" | "completed" | "dismissed" | "cancelled" = "completed",
) {
  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `insert into public.workflow_actions (workflow_id, action_type, action_payload_json, status)
       values ($1,$2,$3::jsonb,$4)`,
      [workflowId, actionType, JSON.stringify(payload), status],
    );
    return;
  }

  const supabase = await createTenantServerClient();
  await supabase.from("workflow_actions").insert({
    workflow_id: workflowId,
    action_type: actionType,
    action_payload_json: payload,
    status,
  });
}

export class MinistryWorkflowService {
  async createWorkflow(input: CreateWorkflowInput) {
    if (shouldUseLocalTenantFallback()) {
      const created = await queryTenantLocalDb<{ id: string }>(
        `insert into public.workflows
          (tenant_id, suggestion_id, workflow_type, owner_user_id, assigned_to_user_id, status, due_at)
         values ($1,$2,'ministry',$3,$4,$5,$6)
         returning id`,
        [
          input.tenantId,
          input.suggestionId ?? null,
          input.ownerUserId,
          input.assignedToUserId ?? null,
          input.assignedToUserId ? "assigned" : "open",
          input.dueAt ?? null,
        ],
      );

      const workflowId = created.rows[0]?.id;
      if (!workflowId) throw new Error("Unable to create workflow.");

      if (input.suggestionId) {
        await queryTenantLocalDb(
          `update public.ai_suggestions
           set status = 'promoted'
           where id = $1 and tenant_id = $2`,
          [input.suggestionId, input.tenantId],
        );
      }

      await insertWorkflowAction(workflowId, "create_workflow", {
        suggestionId: input.suggestionId ?? null,
        assignedToUserId: input.assignedToUserId ?? null,
      });

      return workflowId;
    }

    const supabase = await createTenantServerClient();
    const { data, error } = await supabase
      .from("workflows")
      .insert({
        tenant_id: input.tenantId,
        suggestion_id: input.suggestionId ?? null,
        workflow_type: "ministry",
        owner_user_id: input.ownerUserId,
        assigned_to_user_id: input.assignedToUserId ?? null,
        status: input.assignedToUserId ? "assigned" : "open",
        due_at: input.dueAt ?? null,
      })
      .select("id")
      .single();

    if (error || !data?.id) throw new Error(error?.message ?? "Unable to create workflow.");

    if (input.suggestionId) {
      await supabase
        .from("ai_suggestions")
        .update({ status: "promoted" })
        .eq("id", input.suggestionId)
        .eq("tenant_id", input.tenantId);
    }

    await insertWorkflowAction(data.id, "create_workflow", {
      suggestionId: input.suggestionId ?? null,
      assignedToUserId: input.assignedToUserId ?? null,
    });

    return data.id;
  }

  async assignWorkflow(workflowId: string, assignedToUserId: string | null) {
    const nextStatus: MinistryWorkflowStatus = assignedToUserId ? "assigned" : "open";

    if (shouldUseLocalTenantFallback()) {
      await queryTenantLocalDb(
        `update public.workflows
         set assigned_to_user_id = $2,
             status = $3
         where id = $1`,
        [workflowId, assignedToUserId, nextStatus],
      );
      await insertWorkflowAction(workflowId, "assign_workflow", {
        assignedToUserId,
      });
      return;
    }

    const supabase = await createTenantServerClient();
    await supabase
      .from("workflows")
      .update({ assigned_to_user_id: assignedToUserId, status: nextStatus })
      .eq("id", workflowId);

    await insertWorkflowAction(workflowId, "assign_workflow", {
      assignedToUserId,
    });
  }

  async deferWorkflow(workflowId: string, reason: string, dueAt?: string | null) {
    if (shouldUseLocalTenantFallback()) {
      await queryTenantLocalDb(
        `update public.workflows
         set status = 'deferred', due_at = $2
         where id = $1`,
        [workflowId, dueAt ?? null],
      );
      await insertWorkflowAction(workflowId, "defer_workflow", { reason, dueAt: dueAt ?? null });
      return;
    }

    const supabase = await createTenantServerClient();
    await supabase.from("workflows").update({ status: "deferred", due_at: dueAt ?? null }).eq("id", workflowId);
    await insertWorkflowAction(workflowId, "defer_workflow", { reason, dueAt: dueAt ?? null });
  }

  async dismissWorkflow(workflowId: string, reason: string, suggestionId?: string | null) {
    if (shouldUseLocalTenantFallback()) {
      await queryTenantLocalDb(`update public.workflows set status = 'dismissed' where id = $1`, [workflowId]);
      if (suggestionId) {
        await queryTenantLocalDb(`update public.ai_suggestions set status = 'dismissed' where id = $1`, [suggestionId]);
      }
      await insertWorkflowAction(workflowId, "dismiss_workflow", { reason, suggestionId: suggestionId ?? null }, "dismissed");
      return;
    }

    const supabase = await createTenantServerClient();
    await supabase.from("workflows").update({ status: "dismissed" }).eq("id", workflowId);
    if (suggestionId) {
      await supabase.from("ai_suggestions").update({ status: "dismissed" }).eq("id", suggestionId);
    }
    await insertWorkflowAction(workflowId, "dismiss_workflow", { reason, suggestionId: suggestionId ?? null }, "dismissed");
  }

  async completeWorkflow(workflowId: string, notes?: string | null, suggestionId?: string | null) {
    const completedAt = new Date().toISOString();

    if (shouldUseLocalTenantFallback()) {
      await queryTenantLocalDb(
        `update public.workflows
         set status = 'completed', completed_at = $2
         where id = $1`,
        [workflowId, completedAt],
      );
      if (suggestionId) {
        await queryTenantLocalDb(`update public.ai_suggestions set status = 'completed' where id = $1`, [suggestionId]);
      }
      await insertWorkflowAction(workflowId, "complete_workflow", { notes: notes ?? null, suggestionId: suggestionId ?? null });
      return;
    }

    const supabase = await createTenantServerClient();
    await supabase.from("workflows").update({ status: "completed", completed_at: completedAt }).eq("id", workflowId);
    if (suggestionId) {
      await supabase.from("ai_suggestions").update({ status: "completed" }).eq("id", suggestionId);
    }
    await insertWorkflowAction(workflowId, "complete_workflow", { notes: notes ?? null, suggestionId: suggestionId ?? null });
  }

  async recordWorkflowFeedback(input: RecordFeedbackInput) {
    if (shouldUseLocalTenantFallback()) {
      await queryTenantLocalDb(
        `insert into public.workflow_feedback (workflow_id, user_id, feedback_type, notes)
         values ($1,$2,$3,$4)`,
        [input.workflowId, input.userId, input.feedbackType, input.notes ?? null],
      );
      await insertWorkflowAction(input.workflowId, "record_feedback", {
        feedbackType: input.feedbackType,
      });
      return;
    }

    const supabase = await createTenantServerClient();
    await supabase.from("workflow_feedback").insert({
      workflow_id: input.workflowId,
      user_id: input.userId,
      feedback_type: input.feedbackType,
      notes: input.notes ?? null,
    });

    await insertWorkflowAction(input.workflowId, "record_feedback", {
      feedbackType: input.feedbackType,
    });
  }
}
