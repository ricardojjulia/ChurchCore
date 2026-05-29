"use server";

import { requireChurchSession } from "@/lib/auth";
import { resolveActiveChurchProfileId } from "@/lib/church-profile";
import { runPeopleHouseholdImportDryRun } from "@/lib/people-import-dry-run";
import { hasTenantBackendEnv } from "@/lib/supabase/tenant";

export async function runPeopleImportDryRunAction(input: {
  sourceFilename: string;
  csvText: string;
}) {
  const session = await requireChurchSession("/app/church-admin/people/import");

  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Church admin access is required.");
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    throw new Error("Tenant backend is required for dry-run imports.");
  }

  const actorProfileId = await resolveActiveChurchProfileId(session);

  return runPeopleHouseholdImportDryRun({
    churchId: session.appContext.church.id,
    actorProfileId,
    sourceFilename: input.sourceFilename,
    csvText: input.csvText,
  });
}
