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

import { attemptRetry, retryEligibleCommunications } from "@/lib/communications/retry-eligible";

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

type UpdateResult = { data: Array<{ id: string }> | null; error: { message: string } | null };

const HIT: UpdateResult = { data: [{ id: "row" }], error: null };
const MISS: UpdateResult = { data: [], error: null };

/**
 * Admin client whose communication_logs updates resolve from `updateResults`
 * in order (claim first, then outcome), defaulting to HIT. Every update's
 * patch and guard filters are captured for assertions.
 */
function mockAdminClient(options: {
  rows?: ReturnType<typeof makeEligibleRow>[];
  profile?: { email: string | null; phone: string | null } | null;
  updateResults?: UpdateResult[];
  upsertResult?: { data: null; error: { message: string } | null };
}) {
  const updates: Array<{ patch: Record<string, unknown>; filters: Record<string, unknown> }> = [];
  const updateResults = [...(options.updateResults ?? [])];
  const upsertMock = vi.fn().mockResolvedValue(options.upsertResult ?? { data: null, error: null });

  const update = vi.fn((patch: Record<string, unknown>) => {
    const entry = { patch, filters: {} as Record<string, unknown> };
    updates.push(entry);
    const chain = {
      eq: vi.fn((column: string, value: unknown) => {
        entry.filters[column] = value;
        return chain;
      }),
      select: vi.fn(() => Promise.resolve(updateResults.shift() ?? HIT)),
    };
    return chain;
  });

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
    // communication_logs: eligible query (select…in) or a source-row update
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: options.rows ?? [], error: null }),
      update,
    };
  });

  createTenantAdminClientMock.mockReturnValue({ from: fromMock });
  return { updates, upsertMock };
}

const session = { appContext: { church: { id: "church-1" } }, profile: { id: null } } as never;

// ── Selection (local DB path) ──────────────────────────────────────────────────
//
// The eligible-row query and contact lookup still have a legacy local branch;
// all writes are Supabase-only new code.

describe("retryEligibleCommunications selection (local DB path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
  });

  it("filters out exhausted rows and permanent error codes", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    const result = await retryEligibleCommunications();

    expect(result.selected).toBe(0);
    const [querySql, queryArgs] = queryTenantLocalDbMock.mock.calls[0];
    expect(querySql).toContain("retry_count < 3");
    expect(queryArgs).toContain("timeout");
    expect(queryArgs).toContain("rate_limited");
    expect(queryArgs).toContain("provider_unavailable");
    expect(queryArgs).not.toContain("bad_address");
  });

  it("churchId filter: when provided, query includes church_id constraint", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    await retryEligibleCommunications({ churchId: "church-abc" });

    const [querySql, queryArgs] = queryTenantLocalDbMock.mock.calls[0];
    expect(querySql).toContain("church_id = $1");
    expect(queryArgs[0]).toBe("church-abc");
  });

  it("no churchId filter: query does NOT include church_id constraint", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    await retryEligibleCommunications();

    expect(queryTenantLocalDbMock.mock.calls[0][0]).not.toContain("church_id = $1");
  });
});

// ── Cron run (Supabase admin path) ─────────────────────────────────────────────

describe("retryEligibleCommunications (Supabase admin path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
  });

  it("counts outcomes across rows", async () => {
    mockAdminClient({
      rows: [
        makeEligibleRow({ id: "log-1" }),
        makeEligibleRow({ id: "log-2" }),
        makeEligibleRow({ id: "log-3" }),
      ],
    });
    sendWithSuppressionMock
      .mockResolvedValueOnce({ sent: true, skipped: false })
      .mockResolvedValueOnce({ sent: false, skipped: false, error: "Request timed out", errorCode: "timeout" })
      .mockResolvedValueOnce({ sent: false, skipped: true, skipCode: "suppressed", skipReason: "suppressed" });

    const result = await retryEligibleCommunications();

    expect(result).toEqual({ selected: 3, succeeded: 1, failedAgain: 1, skipped: 1 });
  });

  it("churchId filter is passed to admin query when provided", async () => {
    const eqMock = vi.fn();
    const ltMock = vi.fn().mockReturnThis();
    const inMock = vi.fn().mockReturnThis();
    eqMock.mockImplementation((field: string) =>
      field === "church_id"
        ? Promise.resolve({ data: [], error: null })
        : { eq: eqMock, lt: ltMock, in: inMock },
    );
    createTenantAdminClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: eqMock,
        lt: ltMock,
        in: inMock,
      }),
    });

    await retryEligibleCommunications({ churchId: "church-xyz" });

    expect(eqMock.mock.calls.find((call) => call[0] === "church_id")?.[1]).toBe("church-xyz");
  });

  it("dead-letters a row whose recipient is missing once the budget is spent", async () => {
    const { updates, upsertMock } = mockAdminClient({
      rows: [makeEligibleRow({ retry_count: 2 })],
      profile: null,
    });

    const result = await retryEligibleCommunications();

    expect(result.skipped).toBe(1);
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
    // Only the claim — status and error_code are left alone.
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toEqual(expect.not.objectContaining({ status: expect.anything() }));
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ attempted_count: 3, last_error_code: "recipient_missing" }),
      { onConflict: "communication_log_id" },
    );
  });

  it("does NOT dead-letter a missing recipient while budget remains", async () => {
    const { upsertMock } = mockAdminClient({ rows: [makeEligibleRow({ retry_count: 0 })], profile: null });

    await retryEligibleCommunications();

    expect(upsertMock).not.toHaveBeenCalled();
  });
});

// ── Single attempt: claim → dispatch → record → dead-letter ─────────────────────

describe("attemptRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
  });

  it("claims the attempt before dispatching, guarded on the read retry_count and church", async () => {
    const { updates } = mockAdminClient({});
    sendWithSuppressionMock.mockImplementation(async () => {
      // The claim must already be written when the send happens.
      expect(updates).toHaveLength(1);
      return { sent: true, skipped: false };
    });

    await attemptRetry(makeEligibleRow({ retry_count: 1 }), "a@example.com", session);

    expect(updates[0].patch).toEqual(expect.objectContaining({ retry_count: 2 }));
    expect(updates[0].filters).toEqual({ id: "log-1", church_id: "church-1", retry_count: 1 });
  });

  it("sends nothing when another run already claimed the attempt", async () => {
    const { updates, upsertMock } = mockAdminClient({ updateResults: [MISS] });

    const outcome = await attemptRetry(makeEligibleRow(), "a@example.com", session);

    expect(outcome).toEqual({ kind: "not_claimed" });
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(1);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("dispatches with recordLog: false so no second retry-eligible log row is inserted", async () => {
    mockAdminClient({});
    sendWithSuppressionMock.mockResolvedValue({ sent: true, skipped: false });

    await attemptRetry(makeEligibleRow({ retry_count: 1 }), "a@example.com", session);

    expect(sendWithSuppressionMock).toHaveBeenCalledWith(
      expect.objectContaining({ recordLog: false, retryCount: 2, recipientContact: "a@example.com" }),
    );
  });

  it("records a success on the source row with the provider message id, guarded on the claimed count", async () => {
    const { updates } = mockAdminClient({});
    sendWithSuppressionMock.mockResolvedValue({
      sent: true,
      skipped: false,
      provider: "sendgrid",
      externalId: "sg-msg-123",
    });

    const outcome = await attemptRetry(makeEligibleRow({ retry_count: 1 }), "a@example.com", session);

    expect(outcome).toEqual({ kind: "sent" });
    expect(updates[1].patch).toEqual(
      expect.objectContaining({
        status: "sent",
        provider: "sendgrid",
        provider_message_id: "sg-msg-123",
        external_id: "sg-msg-123",
      }),
    );
    expect(updates[1].filters.retry_count).toBe(2);
  });

  it("a failed success-write still leaves the attempt consumed (bounded re-sends)", async () => {
    const { updates } = mockAdminClient({ updateResults: [HIT, MISS] });
    sendWithSuppressionMock.mockResolvedValue({ sent: true, skipped: false });

    const outcome = await attemptRetry(makeEligibleRow({ retry_count: 1 }), "a@example.com", session);

    expect(outcome).toEqual({ kind: "sent" });
    expect(updates[0].patch.retry_count).toBe(2);
  });

  it("dead-letters with code and message kept separate when the final retry fails", async () => {
    const { updates, upsertMock } = mockAdminClient({});
    sendWithSuppressionMock.mockResolvedValue({
      sent: false,
      skipped: false,
      error: "Service temporarily unavailable",
      errorCode: "provider_unavailable",
    });

    const outcome = await attemptRetry(
      makeEligibleRow({ id: "log-exhausted", retry_count: 2 }),
      "a@example.com",
      session,
    );

    expect(outcome).toEqual({ kind: "failed", error: "Service temporarily unavailable" });
    expect(updates[1].patch).toEqual({
      status: "failed",
      error_code: "provider_unavailable",
      error_message: "Service temporarily unavailable",
    });
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

  it("still dead-letters an exhausted row when the failure write fails — the claim already made it ineligible", async () => {
    const { upsertMock } = mockAdminClient({ updateResults: [HIT, MISS] });
    sendWithSuppressionMock.mockResolvedValue({
      sent: false,
      skipped: false,
      error: "Request timed out",
      errorCode: "timeout",
    });

    await attemptRetry(makeEligibleRow({ retry_count: 2 }), "a@example.com", session);

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ attempted_count: 3 }),
      { onConflict: "communication_log_id" },
    );
  });

  it("does NOT dead-letter a transient failure with budget remaining", async () => {
    const { upsertMock } = mockAdminClient({});
    sendWithSuppressionMock.mockResolvedValue({
      sent: false,
      skipped: false,
      error: "Request timed out",
      errorCode: "timeout",
    });

    await attemptRetry(makeEligibleRow({ retry_count: 0 }), "a@example.com", session);

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("dead-letters a non-transient failure immediately once the code is recorded", async () => {
    const { upsertMock } = mockAdminClient({});
    sendWithSuppressionMock.mockResolvedValue({
      sent: false,
      skipped: false,
      error: "Invalid recipient address",
      errorCode: "sendgrid_400",
    });

    await attemptRetry(makeEligibleRow({ retry_count: 0 }), "a@example.com", session);

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ attempted_count: 1, last_error_code: "sendgrid_400" }),
      { onConflict: "communication_log_id" },
    );
  });

  it("does NOT dead-letter a non-transient failure whose code could not be recorded — the row is still eligible", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { upsertMock } = mockAdminClient({
      updateResults: [HIT, { data: null, error: { message: "connection reset" } }],
    });
    sendWithSuppressionMock.mockResolvedValue({
      sent: false,
      skipped: false,
      error: "Invalid recipient address",
      errorCode: "sendgrid_400",
    });

    await attemptRetry(makeEligibleRow({ retry_count: 0 }), "a@example.com", session);

    expect(upsertMock).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("a thrown dispatch is recorded as unknown_error and dead-lettered", async () => {
    const { updates, upsertMock } = mockAdminClient({});
    sendWithSuppressionMock.mockRejectedValue(new Error("UNSUBSCRIBE_SECRET must be configured"));

    const outcome = await attemptRetry(makeEligibleRow({ retry_count: 0 }), "a@example.com", session);

    expect(outcome).toEqual({ kind: "failed", error: "UNSUBSCRIBE_SECRET must be configured" });
    expect(updates[1].patch).toEqual(expect.objectContaining({ error_code: "unknown_error" }));
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        last_error_code: "unknown_error",
        last_error_message: "UNSUBSCRIBE_SECRET must be configured",
      }),
      { onConflict: "communication_log_id" },
    );
  });

  it("truncates stored error messages to 500 characters", async () => {
    const { updates, upsertMock } = mockAdminClient({});
    const longMessage = "x".repeat(2000);
    sendWithSuppressionMock.mockResolvedValue({
      sent: false,
      skipped: false,
      error: longMessage,
      errorCode: "sendgrid_400",
    });

    await attemptRetry(makeEligibleRow({ retry_count: 0 }), "a@example.com", session);

    expect(updates[1].patch.error_message).toHaveLength(500);
    expect(upsertMock.mock.calls[0][0].last_error_message).toHaveLength(500);
  });

  it.each([
    ["suppressed", "recipient_suppressed"],
    ["opted_out", "recipient_opted_out"],
  ])("dead-letters a %s skip at exhaustion as %s", async (skipCode, expectedCode) => {
    const { upsertMock } = mockAdminClient({});
    sendWithSuppressionMock.mockResolvedValue({
      sent: false,
      skipped: true,
      skipCode,
      skipReason: "Recipient said no.",
    });

    const outcome = await attemptRetry(makeEligibleRow({ retry_count: 2 }), "a@example.com", session);

    expect(outcome).toEqual({ kind: "skipped", reason: "Recipient said no." });
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ last_error_code: expectedCode, last_error_message: "Recipient said no." }),
      { onConflict: "communication_log_id" },
    );
  });

  it("logs and does not throw when the DLQ upsert itself fails", async () => {
    mockAdminClient({ upsertResult: { data: null, error: { message: "connection refused" } } });
    sendWithSuppressionMock.mockResolvedValue({
      sent: false,
      skipped: false,
      error: "Request timed out",
      errorCode: "timeout",
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await attemptRetry(
      makeEligibleRow({ id: "log-exhausted", retry_count: 2 }),
      "a@example.com",
      session,
    );

    expect(outcome.kind).toBe("failed");
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("log-exhausted"));
    consoleErrorSpy.mockRestore();
  });

  it("a thrown admin client during the claim is logged and treated as not claimed", async () => {
    createTenantAdminClientMock.mockImplementation(() => {
      throw new Error("missing service role key");
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await attemptRetry(makeEligibleRow(), "a@example.com", session);

    expect(outcome).toEqual({ kind: "not_claimed" });
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
