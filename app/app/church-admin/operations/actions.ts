"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import { createTenantServerClient } from "@/lib/supabase/tenant";
import { encryptPastoralField, decryptPastoralField } from "@/lib/crypto/pastoral";
import type {
  ChurchDocument,
  ChurchDocumentListItem,
  ChurchDocumentType,
  OnboardingInstanceDetail,
  OnboardingInstanceStep,
  OnboardingInstanceSummary,
  OnboardingTemplate,
  OnboardingTemplateStep,
} from "@/lib/operations-types";

// ── Role helpers ──────────────────────────────────────────────

async function requireOperationsSession() {
  const session = await requireChurchSession("/app/church-admin/operations");
  const role = session.appContext.roleId;
  if (role !== "church-admin" && role !== "pastor") {
    throw new Error("Access denied.");
  }
  return session;
}

async function requireChurchAdminOperationsSession() {
  const session = await requireChurchSession("/app/church-admin/operations");
  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Church-admin access is required.");
  }
  return session;
}

// ── Document actions ──────────────────────────────────────────

export async function createChurchDocumentAction(input: {
  title: string;
  docType: ChurchDocumentType;
  body: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const session = await requireOperationsSession();
    const { title, docType, body } = input;

    if (docType === "elder_council_notes" && !session.profile.isPastoral) {
      return { ok: false, error: "Access denied." };
    }

    if (docType === "elder_council_notes" && !process.env.PASTORAL_ENCRYPTION_KEY) {
      if (process.env.NODE_ENV === "production") {
        return { ok: false, error: "Encryption key not configured." };
      }
    }

    const storedBody =
      docType === "elder_council_notes" ? encryptPastoralField(body) : body;

    const churchId = session.appContext.church.id;
    const actorProfileId = session.profile.id;

    const supabase = await createTenantServerClient();
    const { data, error } = await supabase
      .from("church_documents")
      .insert({
        church_id: churchId,
        title: title.trim(),
        doc_type: docType,
        body: storedBody,
        created_by: actorProfileId,
        updated_by: actorProfileId,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/app/church-admin/operations/documents");
    return { ok: true, id: data.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to create document.",
    };
  }
}

export async function updateChurchDocumentAction(input: {
  id: string;
  title: string;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireOperationsSession();
    const { id, title, body } = input;

    const churchId = session.appContext.church.id;

    const supabase = await createTenantServerClient();

    // Load existing row to confirm ownership and get doc_type
    const { data: existing, error: loadError } = await supabase
      .from("church_documents")
      .select("id, church_id, doc_type")
      .eq("id", id)
      .eq("church_id", churchId)
      .maybeSingle();

    if (loadError) {
      throw new Error(loadError.message);
    }

    if (!existing) {
      return { ok: false, error: "Document not found." };
    }

    const docType = existing.doc_type as ChurchDocumentType;

    if (docType === "elder_council_notes" && !session.profile.isPastoral) {
      return { ok: false, error: "Access denied." };
    }

    if (docType === "elder_council_notes" && !process.env.PASTORAL_ENCRYPTION_KEY) {
      if (process.env.NODE_ENV === "production") {
        return { ok: false, error: "Encryption key not configured." };
      }
    }

    const storedBody =
      docType === "elder_council_notes" ? encryptPastoralField(body) : body;

    const { error: updateError } = await supabase
      .from("church_documents")
      .update({
        title: title.trim(),
        body: storedBody,
        updated_by: session.profile.id,
      })
      .eq("id", id)
      .eq("church_id", churchId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    revalidatePath("/app/church-admin/operations/documents");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to update document.",
    };
  }
}

export async function deleteChurchDocumentAction(input: {
  id: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireOperationsSession();
    const churchId = session.appContext.church.id;

    const supabase = await createTenantServerClient();

    // Verify row belongs to session church
    const { data: existing, error: loadError } = await supabase
      .from("church_documents")
      .select("id")
      .eq("id", input.id)
      .eq("church_id", churchId)
      .maybeSingle();

    if (loadError) {
      throw new Error(loadError.message);
    }

    if (!existing) {
      return { ok: false, error: "Document not found." };
    }

    const { error } = await supabase
      .from("church_documents")
      .delete()
      .eq("id", input.id)
      .eq("church_id", churchId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/app/church-admin/operations/documents");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to delete document.",
    };
  }
}

export async function listChurchDocumentsAction(): Promise<{
  ok: boolean;
  documents?: ChurchDocumentListItem[];
  error?: string;
}> {
  try {
    const session = await requireOperationsSession();
    const churchId = session.appContext.church.id;
    const isPastoral = session.profile.isPastoral;

    const supabase = await createTenantServerClient();
    const { data, error } = await supabase
      .from("church_documents")
      .select("id, church_id, title, doc_type, created_by, updated_by, created_at, updated_at")
      .eq("church_id", churchId)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as Array<{
      id: string;
      church_id: string;
      title: string;
      doc_type: string;
      created_by: string | null;
      updated_by: string | null;
      created_at: string;
      updated_at: string;
    }>;

    // Filter out elder_council_notes entirely for non-pastoral users
    const filtered = isPastoral
      ? rows
      : rows.filter((r) => r.doc_type !== "elder_council_notes");

    const documents: ChurchDocumentListItem[] = filtered.map((r) => ({
      id: r.id,
      churchId: r.church_id,
      title: r.title,
      docType: r.doc_type as ChurchDocumentType,
      createdBy: r.created_by,
      updatedBy: r.updated_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return { ok: true, documents };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to list documents.",
    };
  }
}

export async function getChurchDocumentAction(input: {
  id: string;
}): Promise<{ ok: boolean; document?: ChurchDocument; error?: string }> {
  try {
    const session = await requireOperationsSession();
    const churchId = session.appContext.church.id;

    const supabase = await createTenantServerClient();
    const { data, error } = await supabase
      .from("church_documents")
      .select("id, church_id, title, doc_type, body, created_by, updated_by, created_at, updated_at")
      .eq("id", input.id)
      .eq("church_id", churchId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return { ok: false, error: "Document not found." };
    }

    const row = data as {
      id: string;
      church_id: string;
      title: string;
      doc_type: string;
      body: string;
      created_by: string | null;
      updated_by: string | null;
      created_at: string;
      updated_at: string;
    };

    if (row.doc_type === "elder_council_notes" && !session.profile.isPastoral) {
      return { ok: false, error: "Access denied." };
    }

    let plainBody = row.body;
    if (row.doc_type === "elder_council_notes") {
      try {
        plainBody = decryptPastoralField(row.body);
      } catch {
        return { ok: false, error: "Document could not be decrypted." };
      }
    }

    return {
      ok: true,
      document: {
        id: row.id,
        churchId: row.church_id,
        title: row.title,
        docType: row.doc_type as ChurchDocumentType,
        body: plainBody,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to get document.",
    };
  }
}

// ── Template actions ──────────────────────────────────────────

type TemplateStepInput = {
  title: string;
  description?: string | null;
  assigneeType: "staff" | "new_member";
  sortOrder: number;
};

export async function createOnboardingTemplateAction(input: {
  name: string;
  steps: TemplateStepInput[];
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const session = await requireChurchAdminOperationsSession();

    if (!input.steps || input.steps.length < 1) {
      return { ok: false, error: "At least one step is required." };
    }

    const churchId = session.appContext.church.id;
    const actorProfileId = session.profile.id;

    const supabase = await createTenantServerClient();
    const { data: template, error: templateError } = await supabase
      .from("onboarding_templates")
      .insert({
        church_id: churchId,
        name: input.name.trim(),
        created_by: actorProfileId,
      })
      .select("id")
      .single();

    if (templateError) {
      throw new Error(templateError.message);
    }

    const steps = input.steps.map((s) => ({
      church_id: churchId,
      template_id: template.id,
      sort_order: s.sortOrder,
      title: s.title.trim(),
      description: s.description ?? null,
      assignee_type: s.assigneeType,
    }));

    const { error: stepsError } = await supabase
      .from("onboarding_template_steps")
      .insert(steps);

    if (stepsError) {
      throw new Error(stepsError.message);
    }

    revalidatePath("/app/church-admin/operations/onboarding");
    return { ok: true, id: template.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to create template.",
    };
  }
}

export async function updateOnboardingTemplateAction(input: {
  id: string;
  name: string;
  steps: TemplateStepInput[];
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireChurchAdminOperationsSession();
    const churchId = session.appContext.church.id;

    const supabase = await createTenantServerClient();

    // Verify church ownership
    const { data: existing, error: loadError } = await supabase
      .from("onboarding_templates")
      .select("id")
      .eq("id", input.id)
      .eq("church_id", churchId)
      .is("deleted_at", null)
      .maybeSingle();

    if (loadError) {
      throw new Error(loadError.message);
    }

    if (!existing) {
      return { ok: false, error: "Template not found." };
    }

    // Delete all existing steps then re-insert
    const { error: deleteError } = await supabase
      .from("onboarding_template_steps")
      .delete()
      .eq("template_id", input.id)
      .eq("church_id", churchId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    if (input.steps.length > 0) {
      const steps = input.steps.map((s) => ({
        church_id: churchId,
        template_id: input.id,
        sort_order: s.sortOrder,
        title: s.title.trim(),
        description: s.description ?? null,
        assignee_type: s.assigneeType,
      }));

      const { error: stepsError } = await supabase
        .from("onboarding_template_steps")
        .insert(steps);

      if (stepsError) {
        throw new Error(stepsError.message);
      }
    }

    const { error: updateError } = await supabase
      .from("onboarding_templates")
      .update({ name: input.name.trim() })
      .eq("id", input.id)
      .eq("church_id", churchId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    revalidatePath("/app/church-admin/operations/onboarding");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to update template.",
    };
  }
}

export async function deleteOnboardingTemplateAction(input: {
  id: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireChurchAdminOperationsSession();
    const churchId = session.appContext.church.id;

    const supabase = await createTenantServerClient();

    // Verify ownership
    const { data: existing, error: loadError } = await supabase
      .from("onboarding_templates")
      .select("id")
      .eq("id", input.id)
      .eq("church_id", churchId)
      .is("deleted_at", null)
      .maybeSingle();

    if (loadError) {
      throw new Error(loadError.message);
    }

    if (!existing) {
      return { ok: false, error: "Template not found." };
    }

    // Soft delete
    const { error } = await supabase
      .from("onboarding_templates")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", input.id)
      .eq("church_id", churchId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/app/church-admin/operations/onboarding");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to delete template.",
    };
  }
}

export async function listOnboardingTemplatesAction(): Promise<{
  ok: boolean;
  templates?: OnboardingTemplate[];
  error?: string;
}> {
  try {
    const session = await requireOperationsSession();
    const churchId = session.appContext.church.id;

    const supabase = await createTenantServerClient();
    const { data, error } = await supabase
      .from("onboarding_templates")
      .select("id, church_id, name, created_by, deleted_at, created_at, updated_at")
      .eq("church_id", churchId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const templates: OnboardingTemplate[] = (data ?? []).map((r) => ({
      id: r.id,
      churchId: r.church_id,
      name: r.name,
      createdBy: r.created_by,
      deletedAt: r.deleted_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return { ok: true, templates };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to list templates.",
    };
  }
}

export async function getOnboardingTemplateAction(input: {
  id: string;
}): Promise<{
  ok: boolean;
  template?: OnboardingTemplate;
  steps?: OnboardingTemplateStep[];
  error?: string;
}> {
  try {
    const session = await requireOperationsSession();
    const churchId = session.appContext.church.id;

    const supabase = await createTenantServerClient();

    const { data: tRow, error: tError } = await supabase
      .from("onboarding_templates")
      .select("id, church_id, name, created_by, deleted_at, created_at, updated_at")
      .eq("id", input.id)
      .eq("church_id", churchId)
      .is("deleted_at", null)
      .maybeSingle();

    if (tError) {
      throw new Error(tError.message);
    }

    if (!tRow) {
      return { ok: false, error: "Template not found." };
    }

    const { data: sRows, error: sError } = await supabase
      .from("onboarding_template_steps")
      .select("id, church_id, template_id, sort_order, title, description, assignee_type, created_at, updated_at")
      .eq("template_id", input.id)
      .eq("church_id", churchId)
      .order("sort_order", { ascending: true });

    if (sError) {
      throw new Error(sError.message);
    }

    const template: OnboardingTemplate = {
      id: tRow.id,
      churchId: tRow.church_id,
      name: tRow.name,
      createdBy: tRow.created_by,
      deletedAt: tRow.deleted_at,
      createdAt: tRow.created_at,
      updatedAt: tRow.updated_at,
    };

    const steps: OnboardingTemplateStep[] = (sRows ?? []).map((s) => ({
      id: s.id,
      churchId: s.church_id,
      templateId: s.template_id,
      sortOrder: s.sort_order,
      title: s.title,
      description: s.description ?? null,
      assigneeType: s.assignee_type as "staff" | "new_member",
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));

    return { ok: true, template, steps };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to load template.",
    };
  }
}

// ── Instance actions ──────────────────────────────────────────

export async function startOnboardingInstanceAction(input: {
  profileId: string;
  templateId: string;
}): Promise<{ ok: boolean; instanceId?: string; error?: string }> {
  try {
    const session = await requireChurchAdminOperationsSession();
    const churchId = session.appContext.church.id;

    const supabase = await createTenantServerClient();

    // Verify profile belongs to session church via profiles table
    const { data: profileRow, error: profileRowError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", input.profileId)
      .eq("church_id", churchId)
      .maybeSingle();

    if (profileRowError) {
      throw new Error(profileRowError.message);
    }

    if (!profileRow) {
      return { ok: false, error: "Profile not found in this church." };
    }

    // Load template steps (template must be active and belong to this church)
    const { data: steps, error: stepsError } = await supabase
      .from("onboarding_template_steps")
      .select("id, sort_order, title, description, assignee_type")
      .eq("template_id", input.templateId)
      .eq("church_id", churchId)
      .order("sort_order", { ascending: true });

    if (stepsError) {
      throw new Error(stepsError.message);
    }

    // Verify template itself is not soft-deleted and belongs to church
    const { data: template, error: templateError } = await supabase
      .from("onboarding_templates")
      .select("id")
      .eq("id", input.templateId)
      .eq("church_id", churchId)
      .is("deleted_at", null)
      .maybeSingle();

    if (templateError) {
      throw new Error(templateError.message);
    }

    if (!template) {
      return { ok: false, error: "Template not found." };
    }

    if (!steps || steps.length < 1) {
      return { ok: false, error: "Template has no steps." };
    }

    // Insert instance
    const { data: instance, error: instanceError } = await supabase
      .from("onboarding_instances")
      .insert({
        church_id: churchId,
        template_id: input.templateId,
        profile_id: input.profileId,
        started_by: session.profile.id,
        status: "open",
      })
      .select("id")
      .single();

    if (instanceError) {
      throw new Error(instanceError.message);
    }

    // Snapshot steps
    const instanceSteps = steps.map((s) => ({
      church_id: churchId,
      instance_id: instance.id,
      sort_order: s.sort_order,
      title: s.title,
      description: s.description ?? null,
      assignee_type: s.assignee_type,
      is_complete: false,
    }));

    const { error: instanceStepsError } = await supabase
      .from("onboarding_instance_steps")
      .insert(instanceSteps);

    if (instanceStepsError) {
      throw new Error(instanceStepsError.message);
    }

    revalidatePath("/app/church-admin/operations/onboarding");
    return { ok: true, instanceId: instance.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to start onboarding.",
    };
  }
}

export async function completeOnboardingStepAction(input: {
  instanceStepId: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireOperationsSession();
    const churchId = session.appContext.church.id;

    const supabase = await createTenantServerClient();

    // Load step and verify church_id
    const { data: step, error: stepError } = await supabase
      .from("onboarding_instance_steps")
      .select("id, church_id, assignee_type, is_complete")
      .eq("id", input.instanceStepId)
      .eq("church_id", churchId)
      .maybeSingle();

    if (stepError) {
      throw new Error(stepError.message);
    }

    if (!step) {
      return { ok: false, error: "Step not found." };
    }

    const role = session.appContext.roleId;
    if (
      step.assignee_type === "staff" &&
      role !== "church-admin" &&
      role !== "pastor"
    ) {
      return { ok: false, error: "This step can only be completed by staff." };
    }

    const { error } = await supabase
      .from("onboarding_instance_steps")
      .update({
        is_complete: true,
        completed_at: new Date().toISOString(),
        completed_by: session.profile.id,
      })
      .eq("id", input.instanceStepId)
      .eq("church_id", churchId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/app/church-admin/operations/onboarding");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to complete step.",
    };
  }
}

export async function closeOnboardingInstanceAction(input: {
  instanceId: string;
  reason: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireChurchAdminOperationsSession();

    if (!input.reason || input.reason.trim().length < 5) {
      return { ok: false, error: "A reason of at least 5 characters is required." };
    }

    const churchId = session.appContext.church.id;

    const supabase = await createTenantServerClient();

    // Verify instance belongs to church
    const { data: existing, error: loadError } = await supabase
      .from("onboarding_instances")
      .select("id")
      .eq("id", input.instanceId)
      .eq("church_id", churchId)
      .maybeSingle();

    if (loadError) {
      throw new Error(loadError.message);
    }

    if (!existing) {
      return { ok: false, error: "Instance not found." };
    }

    const { error } = await supabase
      .from("onboarding_instances")
      .update({
        status: "closed",
        close_reason: input.reason.trim(),
        closed_at: new Date().toISOString(),
      })
      .eq("id", input.instanceId)
      .eq("church_id", churchId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/app/church-admin/operations/onboarding");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to close instance.",
    };
  }
}

export async function listOnboardingInstancesAction(): Promise<{
  ok: boolean;
  instances?: OnboardingInstanceSummary[];
  error?: string;
}> {
  try {
    const session = await requireOperationsSession();
    const churchId = session.appContext.church.id;

    const supabase = await createTenantServerClient();

    // Load instances with joined profile name and template name
    const { data: instanceRows, error: instanceError } = await supabase
      .from("onboarding_instances")
      .select(
        "id, church_id, template_id, profile_id, started_by, status, close_reason, closed_at, created_at, updated_at, profiles!onboarding_instances_profile_id_fkey(full_name), onboarding_templates(name)",
      )
      .eq("church_id", churchId)
      .order("created_at", { ascending: false });

    if (instanceError) {
      throw new Error(instanceError.message);
    }

    const rows = (instanceRows ?? []) as unknown as Array<{
      id: string;
      church_id: string;
      template_id: string | null;
      profile_id: string;
      started_by: string | null;
      status: string;
      close_reason: string | null;
      closed_at: string | null;
      created_at: string;
      updated_at: string;
      profiles: { full_name: string | null } | null;
      onboarding_templates: { name: string } | null;
    }>;

    // For step counts, load all instance steps for this church in one query
    const instanceIds = rows.map((r) => r.id);
    const stepCountMap: Record<string, { total: number; completed: number }> = {};

    if (instanceIds.length > 0) {
      const { data: stepRows, error: stepError } = await supabase
        .from("onboarding_instance_steps")
        .select("instance_id, is_complete")
        .in("instance_id", instanceIds);

      if (stepError) {
        throw new Error(stepError.message);
      }

      for (const sr of stepRows ?? []) {
        const entry = stepCountMap[sr.instance_id] ?? { total: 0, completed: 0 };
        entry.total += 1;
        if (sr.is_complete) entry.completed += 1;
        stepCountMap[sr.instance_id] = entry;
      }
    }

    const instances: OnboardingInstanceSummary[] = rows.map((r) => ({
      id: r.id,
      churchId: r.church_id,
      templateId: r.template_id,
      profileId: r.profile_id,
      startedBy: r.started_by,
      status: r.status as "open" | "closed",
      closeReason: r.close_reason,
      closedAt: r.closed_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      profileName: r.profiles?.full_name ?? "Unknown",
      templateName: r.onboarding_templates?.name ?? null,
      totalSteps: stepCountMap[r.id]?.total ?? 0,
      completedSteps: stepCountMap[r.id]?.completed ?? 0,
    }));

    return { ok: true, instances };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to list instances.",
    };
  }
}

export async function getOnboardingInstanceAction(input: {
  instanceId: string;
}): Promise<{ ok: boolean; instance?: OnboardingInstanceDetail; error?: string }> {
  try {
    const session = await requireOperationsSession();
    const churchId = session.appContext.church.id;

    const supabase = await createTenantServerClient();

    const { data: instanceRow, error: instanceError } = await supabase
      .from("onboarding_instances")
      .select(
        "id, church_id, template_id, profile_id, started_by, status, close_reason, closed_at, created_at, updated_at, profiles!onboarding_instances_profile_id_fkey(full_name), onboarding_templates(name)",
      )
      .eq("id", input.instanceId)
      .eq("church_id", churchId)
      .maybeSingle();

    if (instanceError) {
      throw new Error(instanceError.message);
    }

    if (!instanceRow) {
      return { ok: false, error: "Instance not found." };
    }

    const row = instanceRow as unknown as {
      id: string;
      church_id: string;
      template_id: string | null;
      profile_id: string;
      started_by: string | null;
      status: string;
      close_reason: string | null;
      closed_at: string | null;
      created_at: string;
      updated_at: string;
      profiles: { full_name: string | null } | null;
      onboarding_templates: { name: string } | null;
    };

    const { data: stepRows, error: stepsError } = await supabase
      .from("onboarding_instance_steps")
      .select(
        "id, church_id, instance_id, sort_order, title, description, assignee_type, is_complete, completed_at, completed_by, created_at, updated_at",
      )
      .eq("instance_id", input.instanceId)
      .eq("church_id", churchId)
      .order("sort_order", { ascending: true });

    if (stepsError) {
      throw new Error(stepsError.message);
    }

    const steps: OnboardingInstanceStep[] = (stepRows ?? []).map((s) => ({
      id: s.id,
      churchId: s.church_id,
      instanceId: s.instance_id,
      sortOrder: s.sort_order,
      title: s.title,
      description: s.description ?? null,
      assigneeType: s.assignee_type as "staff" | "new_member",
      isComplete: s.is_complete,
      completedAt: s.completed_at ?? null,
      completedBy: s.completed_by ?? null,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));

    const instance: OnboardingInstanceDetail = {
      id: row.id,
      churchId: row.church_id,
      templateId: row.template_id,
      profileId: row.profile_id,
      startedBy: row.started_by,
      status: row.status as "open" | "closed",
      closeReason: row.close_reason,
      closedAt: row.closed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      profileName: row.profiles?.full_name ?? "Unknown",
      templateName: row.onboarding_templates?.name ?? null,
      steps,
    };

    return { ok: true, instance };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to get instance.",
    };
  }
}
