"use server";

import { requireChurchSession } from "@/lib/auth";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

export interface EraseProfileReceipt {
  ok: boolean;
  profileId: string;
  erasedAt: string;
  actorId: string;
  error?: string;
}

export async function eraseProfileData(
  targetProfileId: string
): Promise<EraseProfileReceipt> {
  let session;
  try {
    session = await requireChurchSession("/app/church-admin/members");
  } catch {
    return { ok: false, profileId: targetProfileId, erasedAt: "", actorId: "", error: "Unauthorized" };
  }

  const { appContext } = session;

  if (appContext.roleId !== "church-admin") {
    return {
      ok: false,
      profileId: targetProfileId,
      erasedAt: "",
      actorId: "",
      error: "Forbidden: church admin required",
    };
  }

  // The admin's church profile id (not their login id, which is never a
  // profiles.id): the self-erasure guard compares it with the target, and
  // erase_profile_pii resolves the actor through profiles.id (S7).
  const actorProfileId = session.churchProfileId;
  const churchId = appContext.church.id;
  if (!actorProfileId) {
    return {
      ok: false,
      profileId: targetProfileId,
      erasedAt: "",
      actorId: "",
      error: "Your account has no profile in this church.",
    };
  }

  if (actorProfileId === targetProfileId) {
    return {
      ok: false,
      profileId: targetProfileId,
      erasedAt: "",
      actorId: actorProfileId,
      error: "Cannot erase your own profile",
    };
  }

  // Cross-church guard: verify target profile belongs to actor's church
  const supabase = createTenantAdminClient();
  const { data: targetProfile, error: lookupError } = await supabase
    .from("profiles")
    .select("id, church_id")
    .eq("id", targetProfileId)
    .single();

  if (lookupError || !targetProfile) {
    return {
      ok: false,
      profileId: targetProfileId,
      erasedAt: "",
      actorId: actorProfileId,
      error: "Profile not found",
    };
  }

  if (targetProfile.church_id !== churchId) {
    return {
      ok: false,
      profileId: targetProfileId,
      erasedAt: "",
      actorId: actorProfileId,
      error: "Forbidden: cross-church access denied",
    };
  }

  const { error: rpcError } = await supabase.rpc("erase_profile_pii", {
    target_profile_id: targetProfileId,
    actor_profile_id: actorProfileId,
  });

  if (rpcError) {
    return {
      ok: false,
      profileId: targetProfileId,
      erasedAt: "",
      actorId: actorProfileId,
      error: rpcError.message,
    };
  }

  return {
    ok: true,
    profileId: targetProfileId,
    erasedAt: new Date().toISOString(),
    actorId: actorProfileId,
  };
}
