import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  shouldUseLocalTenantFallbackMock,
  queryTenantLocalDbMock,
  createTenantAdminClientMock,
  sendWithSuppressionMock,
} = vi.hoisted(() => ({
  shouldUseLocalTenantFallbackMock: vi.fn(),
  queryTenantLocalDbMock: vi.fn(),
  createTenantAdminClientMock: vi.fn(),
  sendWithSuppressionMock: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  createTenantAdminClient: createTenantAdminClientMock,
}));

vi.mock("@/lib/communications/send-with-suppression", () => ({
  sendWithSuppression: sendWithSuppressionMock,
}));

import { retryEligibleCommunications } from "@/lib/communications/retry-eligible";

// ── Shared fixture helpers ─────────────────────────────────────────────────────

function makeEligibleRow(overrides?: Partial<{
  id: string;
  church_id: string;
  recipient_id: string | null;
  channel: "email" | "sms";
  subject: string | null;
  body_preview: string | null;
  retry_count: number;
  error_code: string | null;
}>) {
  return {
    id: "log-1",
    church_id: "church-1",
    recipient_id: "profile-2",
    channel: "email" as const,
    subject: "Subject",
    body_preview: "Hello church",
    retry_count: 1,
    error_code: "timeout",
    ...overrides,
  };
}

// ── Local DB path ──────────────────────────────────────────────────────────────

describe("retryEligibleCommunications (local DB path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
  });

  it("happy path: 2 eligible rows, both succeed → { selected:2, succeeded:2, failedAgain:0, skipped:0 }", async () => {
    const row1 = makeEligibleRow({ id: "log-1" });
    const row2 = makeEligibleRow({ id: "log-2", recipient_id: "profile-3" });

    // query eligible rows, then 2 × profile lookup, then 2 × markSent update
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [row1, row2] })                         // eligible query
      .mockResolvedValueOnce({ rows: [{ email: "a@example.com", phone: null }] }) // profile for row1
      .mockResolvedValueOnce({ rows: [] })                                   // markSent row1
      .mockResolvedValueOnce({ rows: [{ email: "b@example.com", phone: null }] }) // profile for row2
      .mockResolvedValueOnce({ rows: [] });                                  // markSent row2

    sendWithSuppressionMock.mockResolvedValue({ sent: true, skipped: false });

    const result = await retryEligibleCommunications();

    expect(result).toEqual({ selected: 2, succeeded: 2, failedAgain: 0, skipped: 0 });
    expect(sendWithSuppressionMock).toHaveBeenCalledTimes(2);
  });

  it("transient re-failure: 1 succeeds, 1 fails with transient code → { succeeded:1, failedAgain:1 }", async () => {
    const row1 = makeEligibleRow({ id: "log-1" });
    const row2 = makeEligibleRow({ id: "log-2", recipient_id: "profile-3" });

    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [row1, row2] })
      .mockResolvedValueOnce({ rows: [{ email: "a@example.com", phone: null }] })
      .mockResolvedValueOnce({ rows: [] })                                   // markSent row1
      .mockResolvedValueOnce({ rows: [{ email: "b@example.com", phone: null }] })
      .mockResolvedValueOnce({ rows: [] });                                  // markFailedAgain row2

    sendWithSuppressionMock
      .mockResolvedValueOnce({ sent: true, skipped: false })
      .mockResolvedValueOnce({ sent: false, skipped: false, error: "timeout" });

    const result = await retryEligibleCommunications();

    expect(result).toEqual({ selected: 2, succeeded: 1, failedAgain: 1, skipped: 0 });
  });

  it("skip: recipient not found → { skipped:1 }", async () => {
    const row = makeEligibleRow();

    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [row] })      // eligible query
      .mockResolvedValueOnce({ rows: [] })          // profile not found
      .mockResolvedValueOnce({ rows: [] });         // incrementRetryCountOnly

    const result = await retryEligibleCommunications();

    expect(result).toEqual({ selected: 1, succeeded: 0, failedAgain: 0, skipped: 1 });
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });

  it("retry_count=3 row: NOT selected by query filter", async () => {
    // The query itself filters retry_count < 3 — we verify by confirming the
    // eligible query SQL contains 'retry_count < 3'.
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    const result = await retryEligibleCommunications();

    expect(result.selected).toBe(0);
    const querySql: string = queryTenantLocalDbMock.mock.calls[0][0];
    expect(querySql).toContain("retry_count < 3");
  });

  it("permanent error_code row: NOT selected by query filter", async () => {
    // The query filters error_code IN (transient set) — rows with 'bad_address' are excluded.
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    const result = await retryEligibleCommunications();

    expect(result.selected).toBe(0);
    const queryArgs: unknown[] = queryTenantLocalDbMock.mock.calls[0][1];
    expect(queryArgs).toContain("timeout");
    expect(queryArgs).toContain("rate_limited");
    expect(queryArgs).toContain("provider_unavailable");
    expect(queryArgs).not.toContain("bad_address");
  });

  it("race guard: conditional UPDATE affects 0 rows → no throw, counted correctly", async () => {
    const row = makeEligibleRow();

    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [row] })                               // eligible
      .mockResolvedValueOnce({ rows: [{ email: "a@example.com", phone: null }] }) // profile
      .mockResolvedValueOnce({ rows: [] });                                 // markSent returns nothing

    sendWithSuppressionMock.mockResolvedValue({ sent: true, skipped: false });

    // Should NOT throw even if 0 rows updated
    const result = await retryEligibleCommunications();

    expect(result.succeeded).toBe(1);
  });

  it("churchId filter: when provided, query includes church_id constraint", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    await retryEligibleCommunications({ churchId: "church-abc" });

    const querySql: string = queryTenantLocalDbMock.mock.calls[0][0];
    const queryArgs: unknown[] = queryTenantLocalDbMock.mock.calls[0][1];
    expect(querySql).toContain("church_id = $1");
    expect(queryArgs[0]).toBe("church-abc");
  });

  it("no churchId filter: query does NOT include church_id constraint", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    await retryEligibleCommunications();

    const querySql: string = queryTenantLocalDbMock.mock.calls[0][0];
    expect(querySql).not.toContain("church_id = $1");
  });

  it("suppressed by sendWithSuppression → counts as skipped", async () => {
    const row = makeEligibleRow();

    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [{ email: "a@example.com", phone: null }] })
      .mockResolvedValueOnce({ rows: [] });   // incrementRetryCountOnly

    sendWithSuppressionMock.mockResolvedValue({ sent: false, skipped: true, skipReason: "suppressed" });

    const result = await retryEligibleCommunications();

    expect(result).toEqual({ selected: 1, succeeded: 0, failedAgain: 0, skipped: 1 });
  });
});

// ── Supabase admin path ────────────────────────────────────────────────────────

describe("retryEligibleCommunications (Supabase admin path)", () => {
  let adminFromMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);

    // Each .from() chain: select/update calls
    const eqFn = vi.fn().mockReturnThis();
    const ltFn = vi.fn().mockReturnThis();
    const inFn = vi.fn().mockReturnThis();
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: null, error: null });

    adminFromMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnValue({
        eq: eqFn,
        lt: ltFn,
      }),
      eq: eqFn,
      lt: ltFn,
      in: inFn,
      maybeSingle: maybeSingleFn,
    });

    createTenantAdminClientMock.mockReturnValue({
      from: adminFromMock,
    });
  });

  it("happy path with admin client: 2 succeed when query returns 2 rows", async () => {
    const row1 = makeEligibleRow({ id: "log-1" });
    const row2 = makeEligibleRow({ id: "log-2", recipient_id: "profile-3" });

    // We need to set up the chain differently for the admin path
    // For each `from` call, return appropriate mocks
    let fromCallCount = 0;

    adminFromMock.mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) {
        // First call: query eligible rows
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [row1, row2], error: null }),
        };
      } else if (fromCallCount === 2 || fromCallCount === 4) {
        // Profile lookups
        const profileEmail = fromCallCount === 2 ? "a@example.com" : "b@example.com";
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { email: profileEmail, phone: null },
            error: null,
          }),
        };
      } else {
        // markSent updates
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              lt: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
    });

    createTenantAdminClientMock.mockReturnValue({ from: adminFromMock });

    sendWithSuppressionMock.mockResolvedValue({ sent: true, skipped: false });

    const result = await retryEligibleCommunications();

    expect(result.succeeded).toBe(2);
    expect(result.failedAgain).toBe(0);
  });

  it("churchId filter is passed to admin query when provided", async () => {
    const eqMock = vi.fn();
    const ltMock = vi.fn().mockReturnThis();
    const inMock = vi.fn().mockReturnThis();
    // The chain is awaitable — resolve with empty data when awaited
    const thenableResult = { data: [], error: null };
    eqMock.mockImplementation((field: string) => {
      if (field === "church_id") {
        // Final eq in the chain — return a thenable
        return Promise.resolve(thenableResult);
      }
      return { eq: eqMock, lt: ltMock, in: inMock };
    });

    adminFromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: eqMock,
      lt: ltMock,
      in: inMock,
    });

    createTenantAdminClientMock.mockReturnValue({ from: adminFromMock });

    await retryEligibleCommunications({ churchId: "church-xyz" });

    // eq should have been called with church_id filter
    const eqCalls = eqMock.mock.calls;
    const churchIdCall = eqCalls.find((call) => call[0] === "church_id");
    expect(churchIdCall).toBeDefined();
    expect(churchIdCall?.[1]).toBe("church-xyz");
  });
});
