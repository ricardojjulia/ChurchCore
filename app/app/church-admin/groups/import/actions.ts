"use server";

import { requireChurchSession } from "@/lib/auth";
import { resolveActiveChurchProfileId } from "@/lib/church-profile";
import {
  commitGroupsImportBatch,
  runGroupsImportDryRun,
} from "@/lib/groups-import-dry-run";
import type { GroupsImportSourceSystem } from "@/lib/groups-import-source-adapters";
import { hasTenantBackendEnv } from "@/lib/supabase/tenant";

export async function runGroupsImportDryRunAction(input: {
  sourceFilename: string;
  sourceSystem?: GroupsImportSourceSystem;
  csvText: string;
}) {
  const session = await requireChurchSession("/app/church-admin/groups/import");

  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Church admin access is required.");
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    throw new Error("Tenant backend is required for dry-run imports.");
  }

  const actorProfileId = await resolveActiveChurchProfileId(session);

  return runGroupsImportDryRun({
    churchId: session.appContext.church.id,
    actorProfileId,
    sourceFilename: input.sourceFilename,
    sourceSystem: input.sourceSystem,
    csvText: input.csvText,
  });
}

export async function commitGroupsImportBatchAction(input: { batchId: string }) {
  const session = await requireChurchSession("/app/church-admin/groups/import");

  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Church admin access is required.");
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    throw new Error("Tenant backend is required for import commit.");
  }

  const actorProfileId = await resolveActiveChurchProfileId(session);

  return commitGroupsImportBatch({
    churchId: session.appContext.church.id,
    actorProfileId,
    batchId: input.batchId,
  });
}
