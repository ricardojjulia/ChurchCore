"use server";

import { requireChurchSession } from "@/lib/auth";
import { resolveActiveChurchProfileId } from "@/lib/church-profile";
import {
  commitAttendanceImportBatch,
  runAttendanceImportDryRun,
} from "@/lib/attendance-import-dry-run";
import type { AttendanceImportSourceSystem } from "@/lib/attendance-import-source-adapters";
import { assertImportSourceSystem } from "@/lib/import-normalize";
import { hasTenantBackendEnv } from "@/lib/supabase/tenant";

// One header row plus this many records.
const MAX_IMPORT_RECORDS = 5000;
// next.config.ts caps server action bodies at 4 MB (Vercel allows 4.5 MB per
// request); 3.5 MB of CSV text leaves headroom for serialization.
const ALLOWED_SOURCE_SYSTEMS = ["generic_csv", "planning_center", "breeze"] as const;
const MAX_IMPORT_BYTES = 3.5 * 1024 * 1024;

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

  const byteLength = Buffer.byteLength(input.csvText, "utf8");
  if (byteLength > MAX_IMPORT_BYTES) {
    throw new Error("CSV file size exceeds the maximum limit of 3.5MB.");
  }
  const lines = input.csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length > MAX_IMPORT_RECORDS + 1) {
    throw new Error("CSV import is limited to a maximum of 5,000 records per batch.");
  }

  assertImportSourceSystem(input.sourceSystem, ALLOWED_SOURCE_SYSTEMS);

  const actorProfileId = await resolveActiveChurchProfileId(session);

  return runAttendanceImportDryRun({
    churchId: session.appContext.church.id,
    actorProfileId,
    sourceFilename: input.sourceFilename,
    sourceSystem: input.sourceSystem,
    csvText: input.csvText,
    timeZone: session.appContext.church.timezone,
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
    actorUserId: session.userId,
    actorRole: session.appContext.roleId,
  });
}
