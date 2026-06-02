"use server";

import { requireChurchSession } from "@/lib/auth";
import { resolveActiveChurchProfileId } from "@/lib/church-profile";
import {
  commitEventsImportBatch,
  runEventsImportDryRun,
} from "@/lib/events-import-dry-run";
import type { EventsImportSourceSystem } from "@/lib/events-import-source-adapters";
import { hasTenantBackendEnv } from "@/lib/supabase/tenant";

export async function runEventsImportDryRunAction(input: {
  sourceFilename: string;
  sourceSystem?: EventsImportSourceSystem;
  csvText: string;
}) {
  const session = await requireChurchSession("/app/church-admin/events/import");

  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Church admin access is required.");
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    throw new Error("Tenant backend is required for dry-run imports.");
  }

  const actorProfileId = await resolveActiveChurchProfileId(session);

  return runEventsImportDryRun({
    churchId: session.appContext.church.id,
    actorProfileId,
    sourceFilename: input.sourceFilename,
    sourceSystem: input.sourceSystem,
    csvText: input.csvText,
  });
}

export async function commitEventsImportBatchAction(input: { batchId: string }) {
  const session = await requireChurchSession("/app/church-admin/events/import");

  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Church admin access is required.");
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    throw new Error("Tenant backend is required for import commit.");
  }

  const actorProfileId = await resolveActiveChurchProfileId(session);

  return commitEventsImportBatch({
    churchId: session.appContext.church.id,
    actorProfileId,
    batchId: input.batchId,
  });
}
