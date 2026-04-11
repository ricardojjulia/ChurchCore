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
import { logTenantViewAuditEvent } from "@/lib/tenant-view-audit";

function isChurchRoleId(value: string): value is ChurchRoleId {
  return (
    value === "church-admin" ||
    value === "pastor" ||
    value === "ministry-leader" ||
    value === "member"
  );
}

export async function launchTenantViewAction(formData: FormData) {
  const session = await getSession();

  if (!session || !session.canAccessControl) {
    throw new Error("Control-plane access is required.");
  }

  const churchId = String(formData.get("churchId") ?? "");
  const roleId = String(formData.get("roleId") ?? "church-admin");

  if (!churchId || !isChurchRoleId(roleId)) {
    throw new Error("A valid tenant view target is required.");
  }

  const tenant = session.tenantViews.find((entry) => entry.id === churchId);

  if (!tenant) {
    throw new Error("That tenant is not available for viewing.");
  }

  await setChurchAppContextSelection({
    churchId,
    roleId,
    source: "impersonation",
  });
  await logTenantViewAuditEvent({
    actorUserId: session.userId,
    churchId,
    roleId,
    eventType: "enter",
  });

  revalidatePath("/control");
  revalidatePath("/app");
  redirect(`/app/${roleId}`);
}

export async function returnToControlPlaneAction() {
  const session = await getSession();

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
