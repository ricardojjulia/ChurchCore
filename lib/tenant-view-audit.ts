import "server-only";

import type { ChurchRoleId } from "@/lib/auth";
import {
  createControlPlaneServerClient,
  hasControlPlaneBackendEnv,
  queryControlPlaneLocalDb,
  shouldUseLocalControlPlaneFallback,
} from "@/lib/supabase/control-plane";

const roleMap: Record<ChurchRoleId, string> = {
  "church-admin": "church_admin",
  secretary: "secretary",
  pastor: "pastor",
  "ministry-leader": "ministry_leader",
  member: "member",
};

export async function logTenantViewAuditEvent({
  actorUserId,
  churchId,
  roleId,
  eventType,
}: {
  actorUserId: string;
  churchId: string;
  roleId: ChurchRoleId;
  eventType: "enter" | "exit";
}) {
  if (!hasControlPlaneBackendEnv()) {
    return;
  }

  if (shouldUseLocalControlPlaneFallback()) {
    await queryControlPlaneLocalDb(
      `
        insert into public.tenant_view_audit_logs (
          actor_user_id,
          church_id,
          viewed_role,
          event_type,
          metadata
        )
        values ($1, $2, $3::public.app_role, $4::public.tenant_view_event_type, $5::jsonb)
      `,
      [
        actorUserId,
        churchId,
        roleMap[roleId],
        eventType,
        JSON.stringify({ source: "control_plane" }),
      ],
    );
    return;
  }

  const supabase = await createControlPlaneServerClient();
  const { error } = await supabase.from("tenant_view_audit_logs").insert({
    actor_user_id: actorUserId,
    church_id: churchId,
    viewed_role: roleMap[roleId],
    event_type: eventType,
    metadata: {
      source: "control_plane",
    },
  });

  if (error) {
    throw new Error(`Failed to write tenant-view audit log: ${error.message}`);
  }
}
