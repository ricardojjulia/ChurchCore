"use server";

import { requireChurchSession } from "@/lib/auth";
import { resolveActiveChurchProfileId } from "@/lib/church-profile";
import {
  commitPeopleHouseholdImportBatch,
  runPeopleHouseholdImportDryRun,
} from "@/lib/people-import-dry-run";
import type { ImportSourceSystem } from "@/lib/people-import-source-adapters";
import { hasTenantBackendEnv } from "@/lib/supabase/tenant";

import { CustomImportMapping } from "@/lib/people-import-dry-run";

export async function runPeopleImportDryRunAction(input: {
  sourceFilename: string;
  sourceSystem?: ImportSourceSystem;
  csvText: string;
  customMapping?: CustomImportMapping;
}) {
  const session = await requireChurchSession("/app/church-admin/people/import");

  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Church admin access is required.");
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    throw new Error("Tenant backend is required for dry-run imports.");
  }

  const byteLength = Buffer.byteLength(input.csvText, "utf8");
  if (byteLength > 5 * 1024 * 1024) {
    throw new Error("CSV file size exceeds the maximum limit of 5MB.");
  }
  const lines = input.csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length > 101) {
    throw new Error("CSV import is limited to a maximum of 100 records per batch.");
  }

  const actorProfileId = await resolveActiveChurchProfileId(session);

  return runPeopleHouseholdImportDryRun({
    churchId: session.appContext.church.id,
    actorProfileId,
    sourceFilename: input.sourceFilename,
    sourceSystem: input.sourceSystem,
    csvText: input.csvText,
    customMapping: input.customMapping,
  });
}

export async function commitPeopleImportBatchAction(input: { batchId: string }) {
  const session = await requireChurchSession("/app/church-admin/people/import");

  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Church admin access is required.");
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    throw new Error("Tenant backend is required for import commit.");
  }

  const actorProfileId = await resolveActiveChurchProfileId(session);

  return commitPeopleHouseholdImportBatch({
    churchId: session.appContext.church.id,
    actorProfileId,
    batchId: input.batchId,
  });
}
