import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  getSessionMock,
  resolveTenantViewTargetMock,
  logAuditEventMock,
  shouldUseLocalControlPlaneFallbackMock,
  createControlPlaneServerClientMock,
  createTenantAdminClientMock,
  controlPlaneFromMock,
  controlPlaneDeleteMock,
  controlPlaneEqMock,
  tenantFromMock,
  tenantDeleteMock,
  tenantEqMock,
  tenantInsertMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const getSession = vi.fn();
  const resolveTenantViewTarget = vi.fn();
  const logAuditEvent = vi.fn();
  const shouldUseLocalControlPlaneFallback = vi.fn(() => false);

  const controlPlaneEq = vi.fn(() => ({ error: null }));
  const controlPlaneUpdate = vi.fn(() => ({ eq: controlPlaneEq }));
  const controlPlaneDelete = vi.fn(() => ({ eq: controlPlaneEq }));
  const controlPlaneFrom = vi.fn(() => ({
    update: controlPlaneUpdate,
    delete: controlPlaneDelete,
  }));
  const createControlPlaneServerClient = vi.fn(async () => ({ from: controlPlaneFrom }));

  const tenantEq = vi.fn(
    (): Promise<{ error: { message: string } | null }> => Promise.resolve({ error: null }),
  );
  const tenantDelete = vi.fn(() => ({ eq: tenantEq }));
  const tenantInsert = vi.fn(() => Promise.resolve({ error: null }));
  const tenantFrom = vi.fn(() => ({ delete: tenantDelete, insert: tenantInsert }));
  const createTenantAdminClient = vi.fn(() => ({ from: tenantFrom }));

  return {
    revalidatePathMock: revalidatePath,
    getSessionMock: getSession,
    resolveTenantViewTargetMock: resolveTenantViewTarget,
    logAuditEventMock: logAuditEvent,
    shouldUseLocalControlPlaneFallbackMock: shouldUseLocalControlPlaneFallback,
    createControlPlaneServerClientMock: createControlPlaneServerClient,
    createTenantAdminClientMock: createTenantAdminClient,
    controlPlaneFromMock: controlPlaneFrom,
    controlPlaneDeleteMock: controlPlaneDelete,
    controlPlaneEqMock: controlPlaneEq,
    tenantFromMock: tenantFrom,
    tenantDeleteMock: tenantDelete,
    tenantEqMock: tenantEq,
    tenantInsertMock: tenantInsert,
  };
});

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  getSession: getSessionMock,
  clearAppContextSelection: vi.fn(),
  setChurchAppContextSelection: vi.fn(),
  setControlAppContextSelection: vi.fn(),
}));

vi.mock("@/lib/control-plane-routing", () => ({
  resolveTenantViewTarget: resolveTenantViewTargetMock,
}));

vi.mock("@/lib/tenant-view-audit", () => ({
  logTenantViewAuditEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/control-plane", () => ({
  shouldUseLocalControlPlaneFallback: shouldUseLocalControlPlaneFallbackMock,
  queryControlPlaneLocalDb: vi.fn(),
  createControlPlaneServerClient: createControlPlaneServerClientMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantAdminClient: createTenantAdminClientMock,
}));

vi.mock("@/lib/actions/audit", () => ({
  logAuditEvent: logAuditEventMock,
}));

import {
  deleteTenantAction,
  eraseTenantDataAction,
  updateTenantAction,
} from "@/app/control/actions";

const adminSession = { userId: "admin-1", canAccessControl: true };
const target = {
  tenantId: "tenant-1",
  church: { id: "church-1", slug: "grace-harbor", name: "Grace Harbor", timezone: "America/New_York" },
  connectionStatus: "ready",
};

describe("control-plane tenant actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalControlPlaneFallbackMock.mockReturnValue(false);
    getSessionMock.mockResolvedValue(adminSession);
    resolveTenantViewTargetMock.mockResolvedValue(target);
    controlPlaneEqMock.mockResolvedValue({ error: null });
    tenantEqMock.mockResolvedValue({ error: null });
    tenantInsertMock.mockResolvedValue({ error: null });
  });

  describe("authorization", () => {
    it("rejects updateTenantAction without control-plane access", async () => {
      getSessionMock.mockResolvedValueOnce({ userId: "u1", canAccessControl: false });
      await expect(
        updateTenantAction({ tenantId: "t1", name: "x", slug: "x", status: "active", billingStatus: "active" }),
      ).rejects.toThrow("Control-plane access is required.");
    });

    it("rejects deleteTenantAction without a session", async () => {
      getSessionMock.mockResolvedValueOnce(null);
      await expect(deleteTenantAction("t1")).rejects.toThrow("Control-plane access is required.");
    });

    it("rejects eraseTenantDataAction without control-plane access", async () => {
      getSessionMock.mockResolvedValueOnce({ userId: "u1", canAccessControl: false });
      await expect(eraseTenantDataAction("t1")).rejects.toThrow("Control-plane access is required.");
    });
  });

  describe("updateTenantAction", () => {
    it("updates the tenant and writes an audit event", async () => {
      const result = await updateTenantAction({
        tenantId: "tenant-1",
        name: "Grace Harbor",
        slug: "grace-harbor",
        status: "active",
        billingStatus: "active",
      });

      expect(result).toEqual({ ok: true });
      expect(controlPlaneFromMock).toHaveBeenCalledWith("tenants");
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "tenants",
          recordId: "tenant-1",
          operation: "UPDATE",
          actorId: "admin-1",
          churchId: "church-1",
        }),
      );
    });

    it("does not block the update if audit logging fails", async () => {
      logAuditEventMock.mockRejectedValueOnce(new Error("audit db down"));

      await expect(
        updateTenantAction({ tenantId: "tenant-1", name: "x", slug: "x", status: "active", billingStatus: "active" }),
      ).resolves.toEqual({ ok: true });
    });
  });

  describe("deleteTenantAction", () => {
    it("deletes the tenant and audits before the row is gone", async () => {
      const result = await deleteTenantAction("tenant-1");

      expect(result).toEqual({ ok: true });
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ operation: "DELETE", recordId: "tenant-1", churchId: "church-1" }),
      );
      // Audit resolution must happen before the row is deleted.
      const auditCallOrder = logAuditEventMock.mock.invocationCallOrder[0];
      const deleteCallOrder = tenantDeleteMock.mock.invocationCallOrder[0] ?? controlPlaneDeleteMock.mock.invocationCallOrder[0];
      expect(auditCallOrder).toBeLessThan(deleteCallOrder);
    });
  });

  describe("eraseTenantDataAction", () => {
    it("requires the tenant view target to resolve", async () => {
      resolveTenantViewTargetMock.mockResolvedValueOnce(null);
      await expect(eraseTenantDataAction("tenant-1")).rejects.toThrow(
        "Tenant view target could not be resolved.",
      );
    });

    it("erases every scoped table, re-seeds an admin, and reports full success", async () => {
      const result = await eraseTenantDataAction("tenant-1");

      expect(result.ok).toBe(true);
      expect(result.churchId).toBe("church-1");
      expect(result.failedTables).toEqual([]);
      expect(result.erasedTables.length).toBeGreaterThan(50);
      expect(result.erasedTables).toContain("profiles");
      expect(result.erasedTables).toContain("pastoral_notes");
      // consent_logs is append-only (ADR 0011) — must never be targeted.
      expect(result.erasedTables).not.toContain("consent_logs");
      expect(result.erasedTables).not.toContain("audit_log");

      expect(tenantInsertMock).toHaveBeenCalledWith(
        expect.objectContaining({ email: "admin@grace-harbor.org", church_id: "church-1" }),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ operation: "ERASE", churchId: "church-1" }),
      );
    });

    it("reports partial failure instead of silently returning ok:true", async () => {
      tenantEqMock.mockImplementation(() => Promise.resolve({ error: null }));
      // Fail exactly one table's delete.
      let calls = 0;
      const originalFrom = tenantFromMock.getMockImplementation();
      tenantFromMock.mockImplementation((table: string) => {
        calls += 1;
        if (table === "donations") {
          return {
            delete: vi.fn(() => ({
              eq: vi.fn(
                (): Promise<{ error: { message: string } | null }> =>
                  Promise.resolve({ error: { message: "fk violation" } }),
              ),
            })),
            insert: tenantInsertMock,
          };
        }
        return originalFrom!(table);
      });

      const result = await eraseTenantDataAction("tenant-1");

      expect(result.ok).toBe(false);
      expect(result.failedTables).toEqual(
        expect.arrayContaining([{ table: "donations", error: "fk violation" }]),
      );
      expect(result.erasedTables).not.toContain("donations");
      expect(calls).toBeGreaterThan(0);
    });
  });
});
