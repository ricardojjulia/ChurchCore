import { beforeEach, describe, expect, it, vi } from "vitest";

const { createTenantAdminClientMock } = vi.hoisted(() => ({
  createTenantAdminClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantAdminClient: createTenantAdminClientMock,
}));

import { logAuditEvent, type LogAuditEventInput } from "@/lib/actions/audit";

function makeInsertChain(error: unknown = null) {
  const insertMock = vi.fn().mockResolvedValue({ error });
  const fromMock = vi.fn().mockReturnValue({ insert: insertMock });
  return { fromMock, insertMock };
}

const baseInput: LogAuditEventInput = {
  tableName: "profiles",
  recordId: "uuid-profile-1",
  operation: "UPDATE",
  actorId: "uuid-actor-1",
  churchId: "uuid-church-1",
  actorRole: "church_admin",
};

describe("logAuditEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a row to audit_log with correct fields", async () => {
    const { fromMock, insertMock } = makeInsertChain();
    createTenantAdminClientMock.mockReturnValue({ from: fromMock });

    await logAuditEvent({
      ...baseInput,
      oldValues: { full_name: "Old Name" },
      newValues: { full_name: "New Name" },
    });

    expect(fromMock).toHaveBeenCalledWith("audit_log");
    expect(insertMock).toHaveBeenCalledWith({
      table_name: "profiles",
      record_id: "uuid-profile-1",
      operation: "UPDATE",
      actor_id: "uuid-actor-1",
      church_id: "uuid-church-1",
      actor_role: "church_admin",
      old_values: { full_name: "Old Name" },
      new_values: { full_name: "New Name" },
    });
  });

  it("throws when tableName is missing", async () => {
    await expect(
      logAuditEvent({ ...baseInput, tableName: "" })
    ).rejects.toThrow("logAuditEvent: tableName is required");
  });

  it("throws when recordId is missing", async () => {
    await expect(
      logAuditEvent({ ...baseInput, recordId: "" })
    ).rejects.toThrow("logAuditEvent: recordId is required");
  });

  it("throws when operation is missing", async () => {
    await expect(
      logAuditEvent({ ...baseInput, operation: "" as "INSERT" })
    ).rejects.toThrow("logAuditEvent: operation is required");
  });

  it("propagates Supabase insert error as a thrown error", async () => {
    const { fromMock } = makeInsertChain({ message: "RLS violation" });
    createTenantAdminClientMock.mockReturnValue({ from: fromMock });

    await expect(logAuditEvent(baseInput)).rejects.toThrow(
      "logAuditEvent failed: RLS violation"
    );
  });

  it("passes churchId: null correctly", async () => {
    const { fromMock, insertMock } = makeInsertChain();
    createTenantAdminClientMock.mockReturnValue({ from: fromMock });

    await logAuditEvent({ ...baseInput, churchId: null });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ church_id: null })
    );
  });

  it("defaults old_values and new_values to null when not provided", async () => {
    const { fromMock, insertMock } = makeInsertChain();
    createTenantAdminClientMock.mockReturnValue({ from: fromMock });

    await logAuditEvent(baseInput);

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ old_values: null, new_values: null })
    );
  });
});
