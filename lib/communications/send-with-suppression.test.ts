import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  shouldUseLocalTenantFallbackMock,
  queryTenantLocalDbMock,
  queueCommunicationActionMock,
  createTenantAdminClientMock,
  createTenantServerClientMock,
} = vi.hoisted(() => ({
  shouldUseLocalTenantFallbackMock: vi.fn(),
  queryTenantLocalDbMock: vi.fn(),
  queueCommunicationActionMock: vi.fn(),
  createTenantAdminClientMock: vi.fn(),
  createTenantServerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  createTenantServerClient: createTenantServerClientMock,
  createTenantAdminClient: createTenantAdminClientMock,
}));

vi.mock("@/lib/notifications/queue-communication", () => ({
  queueCommunicationAction: queueCommunicationActionMock,
}));

import { sendWithSuppression } from "@/lib/communications/send-with-suppression";

describe("sendWithSuppression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
  });

  it("skips send when contact is suppressed", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ reason: "manual" }] })
      .mockResolvedValueOnce({ rows: [{ id: "log-1" }] });

    const result = await sendWithSuppression({
      session: {
        appContext: { church: { id: "church-1" } },
        profile: { id: "profile-1" },
      } as never,
      recipientProfileId: "recipient-1",
      recipientContact: "member@example.com",
      channel: "email",
      subject: "Hello",
      body: "Body",
    });

    expect(result.skipped).toBe(true);
    expect(queueCommunicationActionMock).not.toHaveBeenCalled();
  });

  it("sends when contact is not suppressed", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });
    queueCommunicationActionMock.mockResolvedValue({ sent: true, skipped: false });

    const result = await sendWithSuppression({
      session: {
        appContext: { church: { id: "church-1" } },
        profile: { id: "profile-1" },
      } as never,
      recipientProfileId: "recipient-1",
      recipientContact: "member@example.com",
      channel: "email",
      subject: "Hello",
      body: "Body",
    });

    expect(result.sent).toBe(true);
    expect(queueCommunicationActionMock).toHaveBeenCalledTimes(1);
  });
});

// ── Supabase path (production) ─────────────────────────────────────────────────
//
// ADR 0022: the suppression lookup and the suppressed-log write go through the
// admin client scoped by the server-side church id, never the caller's cookie
// client — crons have no user, and a secretary sits outside can_manage_church.

describe("sendWithSuppression (Supabase path)", () => {
  // A cron-style session: no user, no profile.
  const systemSession = {
    appContext: { church: { id: "church-1" } },
    profile: { id: null },
    userId: null,
  } as never;

  function mockAdmin(suppression: { reason: string } | null) {
    const ilikeMock = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: suppression, error: null }),
    });
    const eqMock = vi.fn();
    const lookupChain = { eq: eqMock, ilike: ilikeMock };
    eqMock.mockReturnValue(lookupChain);
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "log-suppressed" }, error: null }),
      }),
    });
    const fromMock = vi.fn((table: string) =>
      table === "communication_suppressions"
        ? { select: vi.fn().mockReturnValue(lookupChain) }
        : { insert: insertMock },
    );
    createTenantAdminClientMock.mockReturnValue({ from: fromMock });
    return { eqMock, ilikeMock, insertMock };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
  });

  it("detects a suppressed contact for a session with no user and records it through the admin client", async () => {
    const { eqMock, ilikeMock, insertMock } = mockAdmin({ reason: "unsubscribe" });

    const result = await sendWithSuppression({
      session: systemSession,
      recipientProfileId: "recipient-1",
      recipientContact: "member@example.com",
      channel: "email",
      body: "Body",
    });

    expect(result).toMatchObject({ sent: false, skipped: true, skipCode: "suppressed", logId: "log-suppressed" });
    expect(queueCommunicationActionMock).not.toHaveBeenCalled();
    expect(createTenantServerClientMock).not.toHaveBeenCalled();
    expect(eqMock).toHaveBeenCalledWith("church_id", "church-1");
    expect(eqMock).toHaveBeenCalledWith("channel", "email");
    expect(ilikeMock).toHaveBeenCalledWith("contact", "member@example.com");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ church_id: "church-1", status: "suppressed", suppression_reason: "unsubscribe" }),
    );
  });

  it("sends when the admin lookup finds no suppression", async () => {
    mockAdmin(null);
    queueCommunicationActionMock.mockResolvedValue({ sent: true, skipped: false });

    const result = await sendWithSuppression({
      session: systemSession,
      recipientProfileId: "recipient-1",
      recipientContact: "member@example.com",
      channel: "email",
      body: "Body",
    });

    expect(result.sent).toBe(true);
    expect(createTenantServerClientMock).not.toHaveBeenCalled();
  });

  it("does not write a suppressed log row when the caller passes recordLog: false", async () => {
    const { insertMock } = mockAdmin({ reason: "unsubscribe" });

    const result = await sendWithSuppression({
      session: systemSession,
      recipientProfileId: "recipient-1",
      recipientContact: "member@example.com",
      channel: "email",
      body: "Body",
      recordLog: false,
    });

    expect(result).toMatchObject({ skipped: true, skipCode: "suppressed", logId: undefined });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("escapes LIKE wildcards so '_' and '%' in an address match literally", async () => {
    const { ilikeMock } = mockAdmin(null);
    queueCommunicationActionMock.mockResolvedValue({ sent: true, skipped: false });

    await sendWithSuppression({
      session: systemSession,
      recipientProfileId: "recipient-1",
      recipientContact: "john_doe%1@example.com",
      channel: "email",
      body: "Body",
    });

    expect(ilikeMock).toHaveBeenCalledWith("contact", "john\\_doe\\%1@example.com");
  });
});
