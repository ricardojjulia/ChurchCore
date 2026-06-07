"use server";

import { createTenantAdminClient } from "@/lib/supabase/tenant";

export type AuditOperation = "INSERT" | "UPDATE" | "DELETE" | "ERASE";

export interface LogAuditEventInput {
  tableName: string;
  recordId: string;
  operation: AuditOperation;
  actorId: string | null;
  churchId: string | null;
  actorRole: string | null;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
}

export async function logAuditEvent(input: LogAuditEventInput): Promise<void> {
  if (!input.tableName) throw new Error("logAuditEvent: tableName is required");
  if (!input.recordId) throw new Error("logAuditEvent: recordId is required");
  if (!input.operation) throw new Error("logAuditEvent: operation is required");

  const supabase = createTenantAdminClient();

  const { error } = await supabase.from("audit_log").insert({
    table_name: input.tableName,
    record_id: input.recordId,
    operation: input.operation,
    actor_id: input.actorId,
    church_id: input.churchId,
    actor_role: input.actorRole,
    old_values: input.oldValues ?? null,
    new_values: input.newValues ?? null,
  });

  if (error) throw new Error(`logAuditEvent failed: ${error.message}`);
}
