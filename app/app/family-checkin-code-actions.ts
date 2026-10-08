"use server";

import { logAuditEvent } from "@/lib/actions/audit";
import { requireChurchSession } from "@/lib/auth";
import {
  assignFamilyCheckinCode,
  readFamilyCheckinCode,
} from "@/lib/family-checkin-code";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

const FAMILY_PATH = "/app/member/family";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FamilyCheckinCodeResult =
  | { status: "ok"; code: string }
  | { status: "no_family" }
  | { status: "error" };

/**
 * The signed-in person's own family code (shown with a QR on their Family page).
 * Generated the first time it is asked for. The family is derived from the
 * session's church profile on the server; no family id is accepted from the
 * browser, so nobody can read another family's code.
 */
export async function getMyFamilyCheckinCodeAction(): Promise<FamilyCheckinCodeResult> {
  const session = await requireChurchSession(FAMILY_PATH);
  const churchId = session.appContext.church.id;
  if (!session.churchProfileId) return { status: "no_family" };

  const { data: profile, error } = await createTenantAdminClient()
    .from("profiles")
    .select("family_id")
    .eq("id", session.churchProfileId)
    .eq("church_id", churchId)
    .maybeSingle();
  if (error) return { status: "error" };

  const familyId = (profile as { family_id: string | null } | null)?.family_id;
  if (!familyId) return { status: "no_family" };

  const existing = await readFamilyCheckinCode(churchId, familyId);
  if (existing.ok) return { status: "ok", code: existing.code };
  if (existing.reason === "not_found") return { status: "no_family" };

  const created = await assignFamilyCheckinCode({ churchId, familyId, onlyIfMissing: true });
  if (created.ok) return { status: "ok", code: created.code };
  return created.reason === "not_found" ? { status: "no_family" } : { status: "error" };
}

/**
 * Church admin only: rotates one family's code. The old code stops working at
 * once. Audited without the code values.
 */
export async function regenerateFamilyCheckinCodeAction(input: {
  familyId: string;
}): Promise<FamilyCheckinCodeResult> {
  const session = await requireChurchSession("/app/church-admin/people");
  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Unauthorized: regenerating a family code requires the church-admin role.");
  }
  const churchId = session.appContext.church.id;
  const familyId = input?.familyId;
  if (typeof familyId !== "string" || !UUID_PATTERN.test(familyId)) return { status: "no_family" };

  const result = await assignFamilyCheckinCode({ churchId, familyId, onlyIfMissing: false });
  if (!result.ok) return result.reason === "not_found" ? { status: "no_family" } : { status: "error" };

  await logAuditEvent({
    tableName: "families",
    recordId: familyId,
    operation: "UPDATE",
    actorId: session.userId,
    churchId,
    actorRole: "church-admin",
    newValues: { event: "family_checkin_code.regenerated" },
  });
  return { status: "ok", code: result.code };
}
