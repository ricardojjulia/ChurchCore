"use server";

import { requireChurchSession } from "@/lib/auth";
import { resolveActiveChurchProfileId } from "@/lib/church-profile";
import {
  commitAttendanceImportBatch,
  runAttendanceImportDryRun,
} from "@/lib/attendance-import-dry-run";
import type { AttendanceImportSourceSystem } from "@/lib/attendance-import-source-adapters";
import { hasTenantBackendEnv } from "@/lib/supabase/tenant";

export async function runAttendanceImportDryRunAction(input: {
  sourceFilename: string;
  sourceSystem?: AttendanceImportSourceSystem;
  csvText: string;
}) {
  const session = await requireChurchSession("/app/church-admin/attendance/import");

  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Church admin access is required.");
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    throw new Error("Tenant backend is required for dry-run imports.");
  }

  const actorProfileId = await resolveActiveChurchProfileId(session);

  return runAttendanceImportDryRun({
    churchId: session.appContext.church.id,
    actorProfileId,
    sourceFilename: input.sourceFilename,
    sourceSystem: input.sourceSystem,
    csvText: input.csvText,
  });
}

export async function commitAttendanceImportBatchAction(input: { batchId: string }) {
  const session = await requireChurchSession("/app/church-admin/attendance/import");

  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Church admin access is required.");
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    throw new Error("Tenant backend is required for import commit.");
  }

  const actorProfileId = await resolveActiveChurchProfileId(session);

  return commitAttendanceImportBatch({
    churchId: session.appContext.church.id,
    actorProfileId,
    batchId: input.batchId,
  });
}
