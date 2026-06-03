"use server";

import { requireChurchSession } from "@/lib/auth";
import { resolveActiveChurchProfileId } from "@/lib/church-profile";
import {
  commitGivingImportBatch,
  runGivingImportDryRun,
} from "@/lib/giving-import-dry-run";
import type { GivingImportSourceSystem } from "@/lib/giving-import-source-adapters";
import { hasTenantBackendEnv } from "@/lib/supabase/tenant";

export async function runGivingImportDryRunAction(input: {
  sourceFilename: string;
  sourceSystem?: GivingImportSourceSystem;
  csvText: string;
}) {
  const session = await requireChurchSession("/app/church-admin/giving/import");

  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Church admin access is required.");
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    throw new Error("Tenant backend is required for dry-run imports.");
  }

  const actorProfileId = await resolveActiveChurchProfileId(session);

  return runGivingImportDryRun({
    churchId: session.appContext.church.id,
    actorProfileId,
    sourceFilename: input.sourceFilename,
    sourceSystem: input.sourceSystem,
    csvText: input.csvText,
  });
}

export async function commitGivingImportBatchAction(input: { batchId: string }) {
  const session = await requireChurchSession("/app/church-admin/giving/import");

  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Church admin access is required.");
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    throw new Error("Tenant backend is required for import commit.");
  }

  const actorProfileId = await resolveActiveChurchProfileId(session);

  return commitGivingImportBatch({
    churchId: session.appContext.church.id,
    actorProfileId,
    batchId: input.batchId,
  });
}
