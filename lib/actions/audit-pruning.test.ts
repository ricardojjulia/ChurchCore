import { beforeEach, describe, expect, it, vi } from "vitest";

const { createTenantAdminClientMock } = vi.hoisted(() => ({
  createTenantAdminClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantAdminClient: createTenantAdminClientMock,
}));

import { pruneAuditLogsAction } from "@/lib/actions/audit";

function makeRpcChain(error: unknown = null) {
  const rpcMock = vi.fn().mockResolvedValue({ error });
  return { rpcMock };
}

describe("pruneAuditLogsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls public.prune_audit_logs RPC with default retention days", async () => {
    const { rpcMock } = makeRpcChain();
    createTenantAdminClientMock.mockReturnValue({ rpc: rpcMock });

    await pruneAuditLogsAction();

    expect(rpcMock).toHaveBeenCalledWith("prune_audit_logs", {
      retention_days: 365,
    });
  });

  it("calls public.prune_audit_logs RPC with custom retention days", async () => {
    const { rpcMock } = makeRpcChain();
    createTenantAdminClientMock.mockReturnValue({ rpc: rpcMock });

    await pruneAuditLogsAction(90);

    expect(rpcMock).toHaveBeenCalledWith("prune_audit_logs", {
      retention_days: 90,
    });
  });

  it("throws an error when rpc execution fails", async () => {
    const { rpcMock } = makeRpcChain({ message: "Database connection failed" });
    createTenantAdminClientMock.mockReturnValue({ rpc: rpcMock });

    await expect(pruneAuditLogsAction(180)).rejects.toThrow(
      "pruneAuditLogsAction failed: Database connection failed"
    );
  });
});
