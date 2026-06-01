import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  verifyUnsubscribeTokenMock,
  shouldUseLocalTenantFallbackMock,
  queryTenantLocalDbMock,
  createTenantAdminClientMock,
  upsertMock,
} = vi.hoisted(() => {
  const upsertMock = vi.fn().mockResolvedValue({ error: null });
  const fromMock = vi.fn().mockReturnValue({ upsert: upsertMock });
  const createTenantAdminClientMock = vi.fn().mockReturnValue({ from: fromMock });
  return {
    verifyUnsubscribeTokenMock: vi.fn(),
    shouldUseLocalTenantFallbackMock: vi.fn(),
    queryTenantLocalDbMock: vi.fn(),
    createTenantAdminClientMock,
    upsertMock,
  };
});

vi.mock("@/lib/communications/unsubscribe", () => ({
  verifyUnsubscribeToken: verifyUnsubscribeTokenMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  createTenantAdminClient: createTenantAdminClientMock,
}));

import { GET as unsubscribeGet } from "@/app/api/unsubscribe/route";

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/unsubscribe");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
}

const validParams = {
  t: String(Date.now() + 60_000),
  cid: "church-1",
  e: "Member@Example.com",
  ch: "email",
  sig: "abc123",
};

describe("GET /api/unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    queryTenantLocalDbMock.mockResolvedValue({ rows: [] });
  });

  it("returns 400 when verifyUnsubscribeToken returns invalid_signature", async () => {
    verifyUnsubscribeTokenMock.mockReturnValue({ valid: false, reason: "invalid_signature" });

    const response = await unsubscribeGet(makeRequest(validParams));

    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body).toContain("Invalid unsubscribe link");
  });

  it("returns 400 with expiry message when verifyUnsubscribeToken returns expired", async () => {
    verifyUnsubscribeTokenMock.mockReturnValue({ valid: false, reason: "expired" });

    const response = await unsubscribeGet(makeRequest(validParams));

    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body.toLowerCase()).toContain("expired");
  });

  it("returns 200 and writes suppression via local DB path for a valid token", async () => {
    verifyUnsubscribeTokenMock.mockReturnValue({
      valid: true,
      churchId: "church-1",
      contactEmail: "member@example.com",
      channel: "email",
    });
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    queryTenantLocalDbMock.mockResolvedValue({ rows: [] });

    const response = await unsubscribeGet(makeRequest(validParams));

    expect(response.status).toBe(200);
    expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(1);
    const [sql, sqlParams] = queryTenantLocalDbMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("communication_suppressions");
    expect(sqlParams).toContain("church-1");
    expect(sqlParams).toContain("email");
    expect(sqlParams).toContain("member@example.com");
  });

  it("normalizes email to lowercase before writing the suppression", async () => {
    verifyUnsubscribeTokenMock.mockReturnValue({
      valid: true,
      churchId: "church-1",
      contactEmail: "UPPER@EXAMPLE.COM",
      channel: "email",
    });
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    queryTenantLocalDbMock.mockResolvedValue({ rows: [] });

    await unsubscribeGet(makeRequest(validParams));

    const [, sqlParams] = queryTenantLocalDbMock.mock.calls[0] as [string, unknown[]];
    expect(sqlParams).toContain("upper@example.com");
  });

  it("returns 500 when the DB write throws and does not expose error details", async () => {
    verifyUnsubscribeTokenMock.mockReturnValue({
      valid: true,
      churchId: "church-1",
      contactEmail: "member@example.com",
      channel: "email",
    });
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    queryTenantLocalDbMock.mockRejectedValue(new Error("connection refused"));

    const response = await unsubscribeGet(makeRequest(validParams));

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toContain("connection refused");
  });

  it("writes suppression via Supabase client when not using local fallback", async () => {
    verifyUnsubscribeTokenMock.mockReturnValue({
      valid: true,
      churchId: "church-1",
      contactEmail: "user@example.com",
      channel: "email",
    });
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);

    const response = await unsubscribeGet(makeRequest(validParams));

    expect(response.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [upsertArg] = upsertMock.mock.calls[0] as [Record<string, unknown>];
    expect(upsertArg).toMatchObject({
      church_id: "church-1",
      channel: "email",
      contact: "user@example.com",
      reason: "unsubscribe",
      suppressed_by: null,
    });
  });
});
