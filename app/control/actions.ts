"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  clearAppContextSelection,
  getSession,
  setChurchAppContextSelection,
  setControlAppContextSelection,
  type ChurchRoleId,
} from "@/lib/auth";
import { resolveTenantViewTarget } from "@/lib/control-plane-routing";
import { logTenantViewAuditEvent } from "@/lib/tenant-view-audit";

function isChurchRoleId(value: string): value is ChurchRoleId {
  return (
    value === "church-admin" ||
    value === "secretary" ||
    value === "pastor" ||
    value === "ministry-leader" ||
    value === "member"
  );
}

export async function launchTenantViewAction(formData: FormData) {
  const session = await getSession("/control");

  if (!session || !session.canAccessControl) {
    throw new Error("Control-plane access is required.");
  }

  const tenantId = String(formData.get("tenantId") ?? "");
  const roleId = String(formData.get("roleId") ?? "church-admin");

  if (!tenantId || !isChurchRoleId(roleId)) {
    throw new Error("A valid tenant view target is required.");
  }

  const availableTenant = session.tenantViews.find(
    (entry) => entry.tenantId === tenantId,
  );

  if (!availableTenant) {
    throw new Error("That tenant is not available for viewing.");
  }

  const resolvedTarget = await resolveTenantViewTarget(tenantId);

  if (!resolvedTarget) {
    throw new Error(
      "Tenant routing is not available in preview mode. Start Supabase locally (npx supabase start) to launch a tenant view.",
    );
  }

  if (resolvedTarget.connectionStatus !== "ready") {
    throw new Error("That tenant connection is not ready yet.");
  }

  await setChurchAppContextSelection({
    churchId: resolvedTarget.church.id,
    roleId,
    source: "impersonation",
  });
  await logTenantViewAuditEvent({
    actorUserId: session.userId,
    churchId: resolvedTarget.church.id,
    roleId,
    eventType: "enter",
  });

  revalidatePath("/control");
  revalidatePath("/app");
  redirect(`/app/${roleId}`);
}

export async function returnToControlPlaneAction() {
  const session = await getSession("/control");

  if (!session || !session.canAccessControl) {
    throw new Error("Control-plane access is required.");
  }

  if (session.appContext.kind === "church") {
    await logTenantViewAuditEvent({
      actorUserId: session.userId,
      churchId: session.appContext.church.id,
      roleId: session.appContext.roleId,
      eventType: "exit",
    });
  }

  await clearAppContextSelection();
  await setControlAppContextSelection();

  revalidatePath("/control");
  revalidatePath("/app");
  redirect("/control");
}
