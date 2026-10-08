import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  requireChurchSession: vi.fn(),
  computeImportReconciliation: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireChurchSession: hoisted.requireChurchSession }));
vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: hoisted.logAuditEvent }));
vi.mock("@/lib/import-reconciliation", () => ({ computeImportReconciliation: hoisted.computeImportReconciliation }));

import { GET } from "@/app/api/church-admin/imports/[batchId]/report/route";

const BATCH = "00000000-0000-0000-0000-0000000000b1";
const ctx = (batchId: string) => ({ params: Promise.resolve({ batchId }) });
const session = (roleId: string) => ({
  userId: "login-1",
  appContext: { roleId, church: { id: "church-1" } },
});

const ready = {
  state: "ready",
  batch: { id: BATCH, importType: "people_households_csv", sourceSystem: "breeze", sourceFilename: "p.csv", status: "committed", createdAt: "", committedAt: null },
  counts: { sourceRows: 1, expected: 1, written: 1, failed: 0, notAttempted: 0, skipped: 0, rejected: 0 },
  giving: null,
  mismatchCount: 0,
  mismatches: [],
  changedSinceImport: [],
  skipped: [],
  rejected: [],
  rows: [{ rowNumber: 2, sourceId: "M1", classification: "create", outcome: "written", reason: null, giving: null }],
};

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.requireChurchSession.mockResolvedValue(session("church-admin"));
  hoisted.computeImportReconciliation.mockResolvedValue(ready);
  hoisted.logAuditEvent.mockResolvedValue(undefined);
});

describe("GET /api/church-admin/imports/[batchId]/report", () => {
  it.each(["pastor", "secretary", "member", "ministry-leader"])("refuses %s with 403 and reads nothing", async (role) => {
    hoisted.requireChurchSession.mockResolvedValue(session(role));
    const response = await GET(new Request("http://x"), ctx(BATCH));
    expect(response.status).toBe(403);
    expect(hoisted.computeImportReconciliation).not.toHaveBeenCalled();
  });

  it("returns 404 for a malformed id without querying", async () => {
    const response = await GET(new Request("http://x"), ctx("not-a-uuid"));
    expect(response.status).toBe(404);
    expect(hoisted.computeImportReconciliation).not.toHaveBeenCalled();
  });

  it("returns 404 for another church's batch (the church comes from the session)", async () => {
    hoisted.computeImportReconciliation.mockResolvedValue(null);
    const response = await GET(new Request("http://x"), ctx(BATCH));
    expect(response.status).toBe(404);
    expect(hoisted.computeImportReconciliation).toHaveBeenCalledWith("church-1", BATCH, { includeRows: true });
    expect(hoisted.logAuditEvent).not.toHaveBeenCalled();
  });

  it("returns 409 for a legacy or not-yet-committed batch", async () => {
    hoisted.computeImportReconciliation.mockResolvedValue({ state: "legacy", batch: ready.batch, summary: {} });
    expect((await GET(new Request("http://x"), ctx(BATCH))).status).toBe(409);
    hoisted.computeImportReconciliation.mockResolvedValue({ state: "not_available", batch: ready.batch });
    expect((await GET(new Request("http://x"), ctx(BATCH))).status).toBe(409);
  });

  it("serves the CSV and audits the download with the login id", async () => {
    const response = await GET(new Request("http://x"), ctx(BATCH));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const text = await response.text();
    expect(text.split("\n")[0]).toBe("metric,value");
    expect(text).toContain("2,M1,create,written,");
    expect(hoisted.logAuditEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.logAuditEvent).toHaveBeenCalledWith({
      tableName: "import_batches",
      recordId: BATCH,
      operation: "UPDATE",
      actorId: "login-1",
      churchId: "church-1",
      actorRole: "church-admin",
      newValues: { event: "import_report_download", import_type: "people_households_csv", rowCount: 1 },
    });
  });

  it("fails closed with 500 and no CSV when the audit write fails", async () => {
    hoisted.logAuditEvent.mockRejectedValue(new Error("audit down"));
    const response = await GET(new Request("http://x"), ctx(BATCH));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to generate report" });
  });
});
