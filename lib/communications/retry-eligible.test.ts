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
      .mockResolvedValueOnce({ sent: false, skipped: false, error: "Request timed out", errorCode: "timeout" });

    const result = await retryEligibleCommunications();

    expect(result).toEqual({ selected: 2, succeeded: 1, failedAgain: 1, skipped: 0 });
  });

  it("skip: recipient not found → { skipped:1 }", async () => {
    const row = makeEligibleRow();

    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [row] })      // eligible query
      .mockResolvedValueOnce({ rows: [] })          // profile not found
      .mockResolvedValueOnce({ rows: [] });         // consumeAttemptWithoutSend

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
      .mockResolvedValueOnce({ rows: [] });   // consumeAttemptWithoutSend

    sendWithSuppressionMock.mockResolvedValue({ sent: false, skipped: true, skipReason: "suppressed" });

    const result = await retryEligibleCommunications();

    expect(result).toEqual({ selected: 1, succeeded: 0, failedAgain: 0, skipped: 1 });
  });
});

// ── Supabase admin path ────────────────────────────────────────────────────────
//
// Production runs this path (shouldUseLocalTenantFallback() is hardcoded
// false), so terminal-state behaviour is asserted here, not only locally.

type UpdateResult = { data: Array<{ id: string }> | null; error: { message: string } | null };

/**
 * Builds an admin client whose from(table) returns, in order: the eligible
 * query, a profile lookup, the source-row update, and (when reached) the DLQ
 * upsert. Returns the spies the tests assert on.
 */
function mockAdminClient(options: {
  rows: ReturnType<typeof makeEligibleRow>[];
  profile?: { email: string | null; phone: string | null } | null;
  updateResult?: UpdateResult;
  upsertResult?: { data: null; error: { message: string } | null };
}) {
  const updateMock = vi.fn();
  const updateEqMock = vi.fn();
  const upsertMock = vi.fn().mockResolvedValue(options.upsertResult ?? { data: null, error: null });

  const updateChain = {
    eq: updateEqMock,
    select: vi.fn().mockResolvedValue(options.updateResult ?? { data: [{ id: "updated" }], error: null }),
  };
  updateEqMock.mockReturnValue(updateChain);
  updateMock.mockReturnValue(updateChain);

  const fromMock = vi.fn((table: string) => {
    if (table === "communication_dlq") {
      return { upsert: upsertMock };
    }
    if (table === "profiles") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: options.profile === undefined ? { email: "a@example.com", phone: null } : options.profile,
          error: null,
        }),
      };
    }
    // communication_logs: eligible query (select…in) or source-row update
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: options.rows, error: null }),
      update: updateMock,
    };
  });

  createTenantAdminClientMock.mockReturnValue({ from: fromMock });
  return { fromMock, updateMock, updateEqMock, upsertMock };
}

describe("retryEligibleCommunications (Supabase admin path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
  });

  it("happy path with admin client: 2 succeed when query returns 2 rows", async () => {
    mockAdminClient({
      rows: [makeEligibleRow({ id: "log-1" }), makeEligibleRow({ id: "log-2", recipient_id: "profile-3" })],
    });
    sendWithSuppressionMock.mockResolvedValue({ sent: true, skipped: false });

    const result = await retryEligibleCommunications();

    expect(result.succeeded).toBe(2);
    expect(result.failedAgain).toBe(0);
  });

  it("dispatches with recordLog: false so the retry does not insert a second eligible log row", async () => {
    mockAdminClient({ rows: [makeEligibleRow()] });
    sendWithSuppressionMock.mockResolvedValue({ sent: true, skipped: false });

    await retryEligibleCommunications();

    expect(sendWithSuppressionMock).toHaveBeenCalledWith(
      expect.objectContaining({ recordLog: false }),
    );
  });

  it("markSent records the provider message id on the source row for webhook matching", async () => {
    const { updateMock, updateEqMock } = mockAdminClient({ rows: [makeEligibleRow({ retry_count: 1 })] });
    sendWithSuppressionMock.mockResolvedValue({
      sent: true,
      skipped: false,
      provider: "sendgrid",
      externalId: "sg-msg-123",
    });

    await retryEligibleCommunications();

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sent",
        retry_count: 2,
        provider: "sendgrid",
        provider_message_id: "sg-msg-123",
        external_id: "sg-msg-123",
      }),
    );
    // Optimistic guard on the retry_count this run selected.
    expect(updateEqMock).toHaveBeenCalledWith("retry_count", 1);
  });

  it("writes a DLQ row with code and message kept separate when the final retry fails", async () => {
    const row = makeEligibleRow({ id: "log-exhausted", retry_count: 2 });
    const { updateMock, upsertMock } = mockAdminClient({ rows: [row] });
    sendWithSuppressionMock.mockResolvedValue({
      sent: false,
      skipped: false,
      error: "Service temporarily unavailable",
      errorCode: "provider_unavailable",
    });

    const result = await retryEligibleCommunications();

    expect(result).toEqual({ selected: 1, succeeded: 0, failedAgain: 1, skipped: 0 });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        retry_count: 3,
        error_code: "provider_unavailable",
        error_message: "Service temporarily unavailable",
      }),
    );
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communication_log_id: "log-exhausted",
        attempted_count: 3,
        last_error_code: "provider_unavailable",
        last_error_message: "Service temporarily unavailable",
      }),
      { onConflict: "communication_log_id" },
    );
  });

  it("does NOT write to the DLQ when the source-row update fails", async () => {
    const { upsertMock } = mockAdminClient({
      rows: [makeEligibleRow({ retry_count: 2 })],
      updateResult: { data: null, error: { message: "connection reset" } },
    });
    sendWithSuppressionMock.mockResolvedValue({
      sent: false,
      skipped: false,
      error: "Request timed out",
      errorCode: "timeout",
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await retryEligibleCommunications();

    expect(result.failedAgain).toBe(1);
    expect(upsertMock).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("does NOT write to the DLQ when another run already consumed the attempt (0 rows updated)", async () => {
    const { upsertMock } = mockAdminClient({
      rows: [makeEligibleRow({ retry_count: 2 })],
      updateResult: { data: [], error: null },
    });
    sendWithSuppressionMock.mockResolvedValue({
      sent: false,
      skipped: false,
      error: "Request timed out",
      errorCode: "timeout",
    });

    await retryEligibleCommunications();

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("does NOT write to the DLQ on a transient failure with budget remaining", async () => {
    const { upsertMock } = mockAdminClient({ rows: [makeEligibleRow({ retry_count: 0 })] });
    sendWithSuppressionMock.mockResolvedValue({
      sent: false,
      skipped: false,
      error: "Request timed out",
      errorCode: "timeout",
    });

    await retryEligibleCommunications();

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("dead-letters a non-transient failure immediately — it will never be selected again", async () => {
    const { upsertMock } = mockAdminClient({ rows: [makeEligibleRow({ retry_count: 0 })] });
    sendWithSuppressionMock.mockResolvedValue({
      sent: false,
      skipped: false,
      error: "Invalid recipient address",
      errorCode: "sendgrid_400",
    });

    await retryEligibleCommunications();

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ attempted_count: 1, last_error_code: "sendgrid_400" }),
      { onConflict: "communication_log_id" },
    );
  });

  it("dead-letters a row whose recipient is missing when the attempt exhausts the budget", async () => {
    const { updateMock, upsertMock } = mockAdminClient({
      rows: [makeEligibleRow({ retry_count: 2 })],
      profile: null,
    });

    const result = await retryEligibleCommunications();

    expect(result.skipped).toBe(1);
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ status: expect.anything() }),
    );
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ attempted_count: 3, last_error_code: "recipient_missing" }),
      { onConflict: "communication_log_id" },
    );
  });

  it("dead-letters a suppressed recipient when the attempt exhausts the budget", async () => {
    const { upsertMock } = mockAdminClient({ rows: [makeEligibleRow({ retry_count: 2 })] });
    sendWithSuppressionMock.mockResolvedValue({
      sent: false,
      skipped: true,
      skipReason: "Recipient is suppressed for email (unsubscribe).",
    });

    const result = await retryEligibleCommunications();

    expect(result.skipped).toBe(1);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        last_error_code: "recipient_suppressed",
        last_error_message: "Recipient is suppressed for email (unsubscribe).",
      }),
      { onConflict: "communication_log_id" },
    );
  });

  it("does NOT dead-letter a missing recipient while budget remains", async () => {
    const { upsertMock } = mockAdminClient({ rows: [makeEligibleRow({ retry_count: 0 })], profile: null });

    await retryEligibleCommunications();

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("logs and does not throw when the DLQ upsert itself fails", async () => {
    mockAdminClient({
      rows: [makeEligibleRow({ id: "log-exhausted", retry_count: 2 })],
      upsertResult: { data: null, error: { message: "connection refused" } },
    });
    sendWithSuppressionMock.mockResolvedValue({
      sent: false,
      skipped: false,
      error: "Request timed out",
      errorCode: "timeout",
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await retryEligibleCommunications();

    expect(result).toEqual({ selected: 1, succeeded: 0, failedAgain: 1, skipped: 0 });
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("log-exhausted"));
    consoleErrorSpy.mockRestore();
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

    createTenantAdminClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: eqMock,
        lt: ltMock,
        in: inMock,
      }),
    });

    await retryEligibleCommunications({ churchId: "church-xyz" });

    // eq should have been called with church_id filter
    const churchIdCall = eqMock.mock.calls.find((call) => call[0] === "church_id");
    expect(churchIdCall).toBeDefined();
    expect(churchIdCall?.[1]).toBe("church-xyz");
  });
});

// ── Dead-letter queue, local DB path ───────────────────────────────────────────
//
// moveToDeadLetterQueue always writes through the Supabase admin client — it's
// new code, so it doesn't get a local-fallback branch even when the rest of a
// call runs through the local DB path (see the function's own doc comment).

describe("dead-letter queue on retry exhaustion (local DB path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
  });

  it("writes a communication_dlq row only after the guarded source update returns the row", async () => {
    const row = makeEligibleRow({ id: "log-exhausted", retry_count: 2 });

    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [{ email: "a@example.com", phone: null }] })
      .mockResolvedValueOnce({ rows: [{ id: "log-exhausted" }] }); // guarded update hit

    sendWithSuppressionMock.mockResolvedValue({
      sent: false,
      skipped: false,
      error: "Service temporarily unavailable",
      errorCode: "provider_unavailable",
    });

    const upsertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    createTenantAdminClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({ upsert: upsertMock }),
    });

    const result = await retryEligibleCommunications();

    expect(result.failedAgain).toBe(1);
    const [updateSql, updateArgs] = queryTenantLocalDbMock.mock.calls[2];
    expect(updateSql).toContain("retry_count = $2");
    expect(updateSql).toContain("returning id");
    expect(updateArgs.slice(0, 2)).toEqual(["log-exhausted", 2]);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communication_log_id: "log-exhausted",
        attempted_count: 3,
        last_error_code: "provider_unavailable",
        last_error_message: "Service temporarily unavailable",
      }),
      { onConflict: "communication_log_id" },
    );
  });

  it("does NOT write to the DLQ when the guarded update matched no row", async () => {
    const row = makeEligibleRow({ retry_count: 2 });

    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [{ email: "a@example.com", phone: null }] })
      .mockResolvedValueOnce({ rows: [] });

    sendWithSuppressionMock.mockResolvedValue({
      sent: false,
      skipped: false,
      error: "Request timed out",
      errorCode: "timeout",
    });

    await retryEligibleCommunications();

    expect(createTenantAdminClientMock).not.toHaveBeenCalled();
  });

  it("a throwing source update is logged, not rethrown, and the row is not double-processed", async () => {
    const row = makeEligibleRow({ id: "log-exhausted", retry_count: 2 });

    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [{ email: "a@example.com", phone: null }] })
      .mockRejectedValueOnce(new Error("connection refused"));

    sendWithSuppressionMock.mockResolvedValue({
      sent: false,
      skipped: false,
      error: "Request timed out",
      errorCode: "timeout",
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await retryEligibleCommunications();

    expect(result).toEqual({ selected: 1, succeeded: 0, failedAgain: 1, skipped: 0 });
    expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(3);
    expect(createTenantAdminClientMock).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
