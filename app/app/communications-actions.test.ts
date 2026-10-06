import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  hasTenantBackendEnvMock,
  createTenantServerClientMock,
  insertConsentLogEntriesMock,
  sendWithSuppressionMock,
  retryEligibleCommunicationsMock,
  attemptRetryMock,
  resolveRecipientsMock,
  resolveRecipientsByIdsMock,
  createTenantAdminClientMock,
  logAuditEventMock,
} = vi.hoisted(() => {
  const logAuditEvent = vi.fn(async () => undefined);
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();
  const hasTenantBackendEnv = vi.fn();
  const createTenantServerClient = vi.fn();
  const insertConsentLogEntries = vi.fn();
  const sendWithSuppression = vi.fn();
  const retryEligibleCommunications = vi.fn();
  const attemptRetry = vi.fn();
  const resolveRecipients = vi.fn();
  const resolveRecipientsByIds = vi.fn();
  const createTenantAdminClient = vi.fn();

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    hasTenantBackendEnvMock: hasTenantBackendEnv,
    createTenantServerClientMock: createTenantServerClient,
    insertConsentLogEntriesMock: insertConsentLogEntries,
    sendWithSuppressionMock: sendWithSuppression,
    retryEligibleCommunicationsMock: retryEligibleCommunications,
    attemptRetryMock: attemptRetry,
    resolveRecipientsMock: resolveRecipients,
    resolveRecipientsByIdsMock: resolveRecipientsByIds,
    createTenantAdminClientMock: createTenantAdminClient,
    logAuditEventMock: logAuditEvent,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
  createTenantServerClient: createTenantServerClientMock,
  createTenantAdminClient: () => createTenantAdminClientMock() ?? makeInsertClient(),
}));

vi.mock("@/lib/actions/audit", () => ({
  logAuditEvent: logAuditEventMock,
}));

vi.mock("@/lib/consent-log", () => ({
  insertConsentLogEntries: insertConsentLogEntriesMock,
}));

vi.mock("@/lib/communications/send-with-suppression", () => ({
  sendWithSuppression: sendWithSuppressionMock,
}));

vi.mock("@/lib/communications/retry-eligible", () => ({
  retryEligibleCommunications: retryEligibleCommunicationsMock,
  attemptRetry: attemptRetryMock,
}));

vi.mock("@/lib/communications/recipient-resolver", () => ({
  resolveRecipients: resolveRecipientsMock,
  resolveRecipientsByIds: resolveRecipientsByIdsMock,
}));

import {
  broadcastMessageAction,
  cancelScheduledMessageAction,
  composeAndSendMessageAction,
  getMessageAnalyticsAction,
  listCommunicationLogsAction,
  retryCommunicationAction,
  removeSuppressionAction,
  retryAllEligibleAction,
  suppressContactAction,
  updateNotificationPreferencesAction,
} from "@/app/app/communications-actions";

describe("communications actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "member", church: { id: "church-1" } },
      churchProfileId: "profile-1", profile: { id: "profile-1-login"},
      source: "supabase",
      userId: "user-1",
    });
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    hasTenantBackendEnvMock.mockReturnValue(true);
  });

  it("logs explicit channel consents on first preference save", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "profile-1", user_id: "user-1", church_id: "church-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await updateNotificationPreferencesAction({
      profileId: "profile-1",
      emailOptIn: true,
      smsOptIn: false,
      pushOptIn: true,
      inAppOptIn: true,
    });

    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("from public.profiles"),
      ["profile-1", "church-1"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("from public.notification_preferences"),
      ["church-1", "profile-1"],
    );
    expect(insertConsentLogEntriesMock).toHaveBeenCalledWith([
      {
        churchId: "church-1",
        profileId: "profile-1",
        consentType: "communication_preferences",
        consented: true,
        communicationType: "email",
      },
      {
        churchId: "church-1",
        profileId: "profile-1",
        consentType: "communication_preferences",
        consented: false,
        communicationType: "sms",
      },
      {
        churchId: "church-1",
        profileId: "profile-1",
        consentType: "communication_preferences",
        consented: true,
        communicationType: "push",
      },
      {
        churchId: "church-1",
        profileId: "profile-1",
        consentType: "communication_preferences",
        consented: true,
        communicationType: "in_app",
      },
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/member");
  });

  it("blocks members from editing another profile's communication preferences", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({
      rows: [{ id: "profile-2", user_id: "someone-else", church_id: "church-1" }],
    });

    await expect(
      updateNotificationPreferencesAction({
        profileId: "profile-2",
        emailOptIn: true,
        smsOptIn: true,
        pushOptIn: false,
        inAppOptIn: true,
      }),
    ).rejects.toThrow("You may only update your own notification preferences.");

    expect(insertConsentLogEntriesMock).not.toHaveBeenCalled();
  });

  it("denies secretary role from suppression actions but allows retry", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "secretary", church: { id: "church-1" } },
      churchProfileId: "profile-1", profile: { id: "profile-1-login"},
      source: "supabase",
      userId: "user-1",
    });

    // Secretary can now retry (CC-COMM-001 approved amendment)
    // retryCommunicationAction returns "log not found" because the mock returns no rows
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });
    await expect(retryCommunicationAction({ logId: "log-1" })).rejects.toThrow(
      "Communication log not found.",
    );

    // suppressContactAction remains church-admin only
    await expect(
      suppressContactAction({
        channel: "email",
        contact: "member@example.com",
        reason: "manual",
      }),
    ).rejects.toThrow("Only church administrators may suppress contacts.");
  });

  it("suppresses a contact and writes consent log when profile is found", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      churchProfileId: "profile-admin", profile: { id: "profile-admin-login"},
      source: "supabase",
      userId: "admin-1",
    });

    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "supp-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "profile-2" }] });

    await suppressContactAction({
      channel: "email",
      contact: "member@example.com",
      reason: "manual",
      notes: "Manual suppression",
    });

    expect(insertConsentLogEntriesMock).toHaveBeenCalledWith([
      {
        churchId: "church-1",
        profileId: "profile-2",
        consentType: "communication_suppression",
        consented: false,
        communicationType: "email",
      },
    ]);
  });

  it("rejects retry when max retry count is reached", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "pastor", church: { id: "church-1" } },
      churchProfileId: "profile-pastor", profile: { id: "profile-pastor-login"},
      source: "supabase",
      userId: "pastor-1",
    });

    queryTenantLocalDbMock.mockResolvedValueOnce({
      rows: [
        {
          id: "log-1",
          recipient_id: "profile-2",
          channel: "email",
          subject: "Subject",
          body_preview: "Body",
          status: "failed",
          error_code: "timeout",
          retry_count: 3,
        },
      ],
    });

    const result = await retryCommunicationAction({ logId: "log-1" });
    expect(result).toEqual({ retried: false, reason: "Retry limit reached." });
    expect(attemptRetryMock).not.toHaveBeenCalled();
  });

  it("retries eligible failed communication", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "pastor", church: { id: "church-1" } },
      churchProfileId: "profile-pastor", profile: { id: "profile-pastor-login"},
      source: "supabase",
      userId: "pastor-1",
    });

    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "log-1",
            recipient_id: "profile-2",
            channel: "email",
            subject: "Subject",
            body_preview: "Body",
            status: "failed",
            error_code: "timeout",
            retry_count: 1,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ email: "member@example.com", phone: null }] });

    attemptRetryMock.mockResolvedValue({ kind: "sent" });

    const result = await retryCommunicationAction({ logId: "log-1" });
    expect(result).toEqual({ retried: true });
    // Goes through the shared source-row path, never a direct (row-inserting) send.
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
    expect(attemptRetryMock).toHaveBeenCalledTimes(1);
    expect(attemptRetryMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "log-1", church_id: "church-1", retry_count: 1 }),
      "member@example.com",
      expect.objectContaining({ userId: "pastor-1" }),
    );
  });

  it.each([
    [{ kind: "failed", error: "Request timed out" }, { retried: false, reason: "Request timed out" }],
    [{ kind: "skipped", reason: "Recipient is suppressed." }, { retried: false, reason: "Recipient is suppressed." }],
    [
      { kind: "not_claimed" },
      { retried: false, reason: "This communication was already retried. Refresh to see its latest status." },
    ],
  ])("maps attempt outcome %j to %j", async (outcome, expected) => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "pastor", church: { id: "church-1" } },
      churchProfileId: "profile-pastor", profile: { id: "profile-pastor-login"},
      source: "supabase",
      userId: "pastor-1",
    });

    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "log-1",
            recipient_id: "profile-2",
            channel: "email",
            subject: "Subject",
            body_preview: "Body",
            status: "failed",
            error_code: "timeout",
            retry_count: 1,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ email: "member@example.com", phone: null }] });

    attemptRetryMock.mockResolvedValue(outcome);

    expect(await retryCommunicationAction({ logId: "log-1" })).toEqual(expected);
  });

  it("rejects retry when the communication log is outside the active church scope", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "pastor", church: { id: "church-1" } },
      churchProfileId: "profile-pastor", profile: { id: "profile-pastor-login"},
      source: "supabase",
      userId: "pastor-1",
    });

    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    await expect(retryCommunicationAction({ logId: "foreign-log" })).rejects.toThrow(
      "Communication log not found.",
    );
    expect(attemptRetryMock).not.toHaveBeenCalled();
  });

  it("does not write suppression consent when no in-church profile matches", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      churchProfileId: "profile-admin", profile: { id: "profile-admin-login"},
      source: "supabase",
      userId: "admin-1",
    });

    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "supp-2" }] })
      .mockResolvedValueOnce({ rows: [] });

    await suppressContactAction({
      channel: "email",
      contact: "external@example.com",
      reason: "manual",
    });

    expect(insertConsentLogEntriesMock).not.toHaveBeenCalled();
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("from public.profiles"),
      ["church-1", "email", "external@example.com"],
    );
  });

  it("broadcast keeps going when one recipient's send throws, and reports it as an error", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "secretary", church: { id: "church-1" } },
      churchProfileId: "profile-sec", profile: { id: "profile-sec-login"},
      source: "supabase",
      userId: "sec-1",
    });
    resolveRecipientsByIdsMock.mockResolvedValue([
      { profileId: "p-1", name: "p-1", contact: "p-1@example.com" },
      { profileId: "p-2", name: "p-2", contact: "p-2@example.com" },
    ]);
    sendWithSuppressionMock
      .mockRejectedValueOnce(new Error("Failed to read notification preferences"))
      .mockResolvedValueOnce({ sent: true, skipped: false });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await broadcastMessageAction({
      recipientIds: ["p-1", "p-2"],
      channel: "email",
      subject: "Hello",
      body: "Hello church",
    });

    expect(sendWithSuppressionMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 1, skipped: 0, errors: 1 });
    consoleErrorSpy.mockRestore();
  });

  it("rejects email broadcast without subject", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "pastor", church: { id: "church-1" } },
      churchProfileId: "profile-pastor", profile: { id: "profile-pastor-login"},
      source: "supabase",
      userId: "pastor-1",
    });

    await expect(
      broadcastMessageAction(
        {
          recipientIds: ["profile-2"],
          channel: "email",
          subject: "   ",
          body: "Hello church",
        },
      ),
    ).rejects.toThrow("Email subject is required.");

    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });

  it("rejects broadcast with non-future schedule time", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "pastor", church: { id: "church-1" } },
      churchProfileId: "profile-pastor", profile: { id: "profile-pastor-login"},
      source: "supabase",
      userId: "pastor-1",
    });

    await expect(
      broadcastMessageAction(
        {
          recipientIds: ["profile-2"],
          channel: "email",
          subject: "Reminder",
          body: "Hello church",
          scheduledFor: "2000-01-01T00:00:00.000Z",
        },
      ),
    ).rejects.toThrow("Scheduled send time must be in the future.");

    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });

  it("normalizes future schedule and trimmed content for valid broadcast", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "pastor", church: { id: "church-1" } },
      churchProfileId: "profile-pastor", profile: { id: "profile-pastor-login"},
      source: "supabase",
      userId: "pastor-1",
    });

    sendWithSuppressionMock.mockResolvedValue({ sent: true, skipped: false });
    resolveRecipientsByIdsMock.mockResolvedValue([
      { profileId: "profile-2", name: "Member", contact: "member@example.com" },
    ]);

    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const result = await broadcastMessageAction(
        {
        recipientIds: ["profile-2"],
        channel: "email",
        subject: "  Reminder  ",
        body: "  Hello church  ",
        scheduledFor: future,
      },
    );

    expect(result).toEqual({ sent: 1, skipped: 0, errors: 0 });
    expect(sendWithSuppressionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "email",
        subject: "Reminder",
        body: "Hello church",
        scheduledFor: expect.stringMatching(/Z$/),
      }),
    );
  });
});

describe("broadcastMessageAction resolves recipients on the server (S6, F6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "pastor", church: { id: "church-1" } },
      churchProfileId: "profile-pastor", profile: { id: "profile-pastor-login" },
      source: "supabase",
      userId: "pastor-1",
    });
    sendWithSuppressionMock.mockResolvedValue({ sent: true, skipped: false });
  });

  const input = (recipientIds: string[]) => ({
    recipientIds,
    channel: "email" as const,
    subject: "Hello",
    body: "Hello church",
  });

  it("sends to the contact on the member's profile, looked up in the sender's church", async () => {
    resolveRecipientsByIdsMock.mockResolvedValue([{ profileId: "p-1", name: "Ana", contact: "ana@church.test" }]);

    const result = await broadcastMessageAction(input(["p-1"]));

    expect(resolveRecipientsByIdsMock).toHaveBeenCalledWith("church-1", "email", ["p-1"]);
    expect(sendWithSuppressionMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientProfileId: "p-1", recipientContact: "ana@church.test" }),
    );
    expect(result).toEqual({ sent: 1, skipped: 0, errors: 0 });
  });

  it("ignores contact details a caller tries to pass in: only ids are read", async () => {
    resolveRecipientsByIdsMock.mockResolvedValue([{ profileId: "p-1", name: "Ana", contact: "ana@church.test" }]);
    const forged = {
      ...input(["p-1"]),
      recipients: [{ profileId: "p-1", email: "attacker@evil.test" }],
    } as unknown as Parameters<typeof broadcastMessageAction>[0];

    await broadcastMessageAction(forged);

    expect(sendWithSuppressionMock).toHaveBeenCalledTimes(1);
    expect(sendWithSuppressionMock).toHaveBeenCalledWith(expect.objectContaining({ recipientContact: "ana@church.test" }));
  });

  it("skips ids that don't resolve here (another church, merged, contact not allowed) and members without a contact", async () => {
    resolveRecipientsByIdsMock.mockResolvedValue([
      { profileId: "p-1", name: "Ana", contact: "ana@church.test" },
      { profileId: "p-2", name: "Ben", contact: null },
    ]);

    const result = await broadcastMessageAction(input(["p-1", "p-2", "other-church-profile"]));

    expect(sendWithSuppressionMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sent: 1, skipped: 2, errors: 0 });
  });

  it("sends once to an id listed twice", async () => {
    resolveRecipientsByIdsMock.mockResolvedValue([{ profileId: "p-1", name: "Ana", contact: "ana@church.test" }]);

    const result = await broadcastMessageAction(input(["p-1", "p-1"]));

    expect(resolveRecipientsByIdsMock).toHaveBeenCalledWith("church-1", "email", ["p-1"]);
    expect(result).toEqual({ sent: 1, skipped: 0, errors: 0 });
  });
});

describe("retryAllEligibleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    hasTenantBackendEnvMock.mockReturnValue(true);
    retryEligibleCommunicationsMock.mockResolvedValue({
      selected: 2,
      succeeded: 2,
      failedAgain: 0,
      skipped: 0,
    });
  });

  it("throws for member role", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "member", church: { id: "church-1" } },
      churchProfileId: "profile-1", profile: { id: "profile-1-login"},
      source: "supabase",
      userId: "user-1",
    });

    await expect(retryAllEligibleAction()).rejects.toThrow(
      "Only pastors and church administrators may retry communications.",
    );
    expect(retryEligibleCommunicationsMock).not.toHaveBeenCalled();
  });

  it("allows secretary role (CC-COMM-001 approved amendment)", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "secretary", church: { id: "church-1" } },
      churchProfileId: "profile-1", profile: { id: "profile-1-login"},
      source: "supabase",
      userId: "user-1",
    });

    const result = await retryAllEligibleAction();
    expect(retryEligibleCommunicationsMock).toHaveBeenCalledWith({ churchId: "church-1" });
    expect(result).toEqual({ selected: 2, succeeded: 2, failedAgain: 0, skipped: 0 });
  });

  it("calls retryEligibleCommunications with churchId for pastor role and revalidates path", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "pastor", church: { id: "church-1" } },
      churchProfileId: "profile-pastor", profile: { id: "profile-pastor-login"},
      source: "supabase",
      userId: "pastor-1",
    });

    const result = await retryAllEligibleAction();

    expect(retryEligibleCommunicationsMock).toHaveBeenCalledWith({ churchId: "church-1" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/communications");
    expect(result).toEqual({ selected: 2, succeeded: 2, failedAgain: 0, skipped: 0 });
  });

  it("calls retryEligibleCommunications with churchId for church-admin role and revalidates path", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-2" } },
      churchProfileId: "profile-admin", profile: { id: "profile-admin-login"},
      source: "supabase",
      userId: "admin-1",
    });

    const result = await retryAllEligibleAction();

    expect(retryEligibleCommunicationsMock).toHaveBeenCalledWith({ churchId: "church-2" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/communications");
    expect(result).toEqual({ selected: 2, succeeded: 2, failedAgain: 0, skipped: 0 });
  });
});

// ─── CC-COMM-001 action tests ─────────────────────────────────────────────────

/** Minimal Supabase client that returns a successful log insert with id "log-cc". */
function makeInsertClient() {
  return {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: { id: "log-cc" }, error: null })),
        })),
      })),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      order: vi.fn(async () => ({ data: [], error: null })),
      update: vi.fn().mockReturnThis(),
    })),
  };
}

describe("CC-COMM-001: composeAndSendMessageAction (actions.test)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    hasTenantBackendEnvMock.mockReturnValue(true);
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      churchProfileId: "profile-actor", profile: { id: "profile-actor-login"},
      source: "supabase",
      userId: "user-actor",
    });
    resolveRecipientsMock.mockResolvedValue([
      { profileId: "p-1", name: "Alice", contact: "alice@example.com" },
    ]);
    sendWithSuppressionMock.mockResolvedValue({ sent: true, skipped: false });
    createTenantServerClientMock.mockResolvedValue(makeInsertClient());
  });

  it("AC1: ministry_leader role is denied", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "ministry-leader", church: { id: "church-1" } },
      churchProfileId: "profile-ml", profile: { id: "profile-ml-login"},
      source: "supabase",
      userId: "user-ml",
    });

    const result = await composeAndSendMessageAction({
      channel: "email",
      subject: "Test",
      body: "Hello",
      segment: {},
      scheduledFor: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Access denied.");
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });

  it("AC12: immediate send inserts log with status=queued and calls sendWithSuppression", async () => {
    const result = await composeAndSendMessageAction({
      channel: "email",
      subject: "Sunday Bulletin",
      body: "Join us this Sunday",
      segment: {},
      scheduledFor: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.logId).toBe("log-cc");

    // sendWithSuppression must be called (not broadcastMessageAction)
    expect(sendWithSuppressionMock).toHaveBeenCalledTimes(1);
    expect(sendWithSuppressionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "email",
        recipientProfileId: "p-1",
        recipientContact: "alice@example.com",
        subject: "Sunday Bulletin",
        body: "Join us this Sunday",
      }),
    );
  });

  it("AC10: scheduled send inserts log with status=scheduled and does NOT call sendWithSuppression", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();

    const result = await composeAndSendMessageAction({
      channel: "email",
      subject: "Upcoming Event",
      body: "Don't miss it",
      segment: {},
      scheduledFor: future,
    });

    expect(result.ok).toBe(true);
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });

  it("AC10: past scheduledFor is rejected", async () => {
    const result = await composeAndSendMessageAction({
      channel: "email",
      subject: "Past",
      body: "Hello",
      segment: {},
      scheduledFor: "2000-01-01T00:00:00.000Z",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("future");
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });

  it("AC2: email without subject is rejected", async () => {
    const result = await composeAndSendMessageAction({
      channel: "email",
      subject: null,
      body: "Hello",
      segment: {},
      scheduledFor: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("subject");
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });

  it("zero-recipient segment is rejected", async () => {
    resolveRecipientsMock.mockResolvedValue([]);

    const result = await composeAndSendMessageAction({
      channel: "sms",
      subject: null,
      body: "Hello",
      segment: {},
      scheduledFor: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("No contactable recipients");
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });
});

describe("suppressContactAction on Supabase (Council Review 28)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    hasTenantBackendEnvMock.mockReturnValue(true);
  });

  it("writes through the admin client, scoped to the admin's church, not the user's client", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      churchProfileId: "profile-admin", profile: { id: "profile-admin-login" },
      source: "supabase",
      userId: "admin-1",
    });
    const insert = vi.fn(async () => ({ error: null }));
    const profileLookup = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    createTenantAdminClientMock.mockReturnValueOnce({
      from: vi.fn((table: string) => (table === "communication_suppressions" ? { insert } : profileLookup)),
    });

    await suppressContactAction({ channel: "email", contact: " Member@Example.com ", reason: "manual" });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ church_id: "church-1", contact: "member@example.com", suppressed_by: "profile-admin" }),
    );
    expect(profileLookup.eq).toHaveBeenCalledWith("church_id", "church-1");
    expect(createTenantServerClientMock).not.toHaveBeenCalled();
  });
});

describe("CC-COMM-001: cancelScheduledMessageAction (actions.test)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    hasTenantBackendEnvMock.mockReturnValue(true);
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      churchProfileId: "profile-actor", profile: { id: "profile-actor-login"},
      source: "supabase",
      userId: "user-actor",
    });
  });

  it("AC11: cancels a scheduled log → status becomes cancelled", async () => {
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn(async () => ({ data: [{ id: "log-1" }], error: null })),
    };
    createTenantAdminClientMock.mockReturnValueOnce({ from: vi.fn(() => chain) });
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({
          data: { id: "log-1", status: "scheduled", church_id: "church-1" },
          error: null,
        })),
      })),
    });

    const result = await cancelScheduledMessageAction("log-1");
    expect(result.ok).toBe(true);
    expect(chain.update).toHaveBeenCalledWith({ status: "cancelled" });
    expect(chain.eq).toHaveBeenCalledWith("status", "scheduled");
  });

  it("AC11: fails on a sent log", async () => {
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({
          data: { id: "log-1", status: "sent", church_id: "church-1" },
          error: null,
        })),
      })),
    });

    const result = await cancelScheduledMessageAction("log-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("scheduled");
  });

  it("AC9/AC22: cross-church logId is denied (returns not found)", async () => {
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      })),
    });

    const result = await cancelScheduledMessageAction("foreign-log");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not found");
  });
});

describe("CC-COMM-001: getMessageAnalyticsAction (actions.test)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    hasTenantBackendEnvMock.mockReturnValue(true);
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      churchProfileId: "profile-actor", profile: { id: "profile-actor-login"},
      source: "supabase",
      userId: "user-actor",
    });
  });

  it("AC17: aggregates delivery events correctly (3 delivered, 1 bounced)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (createTenantServerClientMock as any).mockResolvedValue({
      from: (table: string) => {
        if (table === "communication_logs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({
              data: { id: "log-1", channel: "email" },
              error: null,
            })),
          };
        }
        // communication_delivery_events
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: [
                { event_type: "sent" },
                { event_type: "delivered" },
                { event_type: "delivered" },
                { event_type: "delivered" },
                { event_type: "bounced" },
              ],
              error: null,
            })),
          })),
        };
      },
    });

    const result = await getMessageAnalyticsAction("log-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.analytics.sentCount).toBe(1);
      expect(result.analytics.deliveredCount).toBe(3);
      expect(result.analytics.bouncedCount).toBe(1);
    }
  });

  it("AC20: return type has no recipientContact, email, or phone field", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (createTenantServerClientMock as any).mockResolvedValue({
      from: (table: string) => {
        if (table === "communication_logs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({
              data: { id: "log-1", channel: "email" },
              error: null,
            })),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: [{ event_type: "delivered" }],
              error: null,
            })),
          })),
        };
      },
    });

    const result = await getMessageAnalyticsAction("log-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.analytics).not.toHaveProperty("recipientContact");
      expect(result.analytics).not.toHaveProperty("email");
      expect(result.analytics).not.toHaveProperty("phone");
    }
  });

  it("AC19: ministry_leader role is denied", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "ministry-leader", church: { id: "church-1" } },
      churchProfileId: "profile-ml", profile: { id: "profile-ml-login"},
      source: "supabase",
      userId: "user-ml",
    });

    const result = await getMessageAnalyticsAction("log-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Access denied.");
  });
});

describe("CC-COMM-001: listCommunicationLogsAction (actions.test)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    hasTenantBackendEnvMock.mockReturnValue(true);
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      churchProfileId: "profile-actor", profile: { id: "profile-actor-login"},
      source: "supabase",
      userId: "user-actor",
    });
  });

  it("AC22: returns only session-church logs", async () => {
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn(async () => ({
          data: [
            {
              id: "log-church-1",
              channel: "email",
              subject: "Hello",
              body_preview: "Hi",
              status: "sent",
              scheduled_for: null,
              sent_at: "2026-01-01T10:00:00.000Z",
              created_at: "2026-01-01T09:00:00.000Z",
              retry_count: 0,
              segment_criteria: null,
              profiles: { full_name: "Pastor John" },
            },
          ],
          error: null,
        })),
      })),
    });

    const result = await listCommunicationLogsAction();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].id).toBe("log-church-1");
    }
  });

  it("G5.1: selects error_code and provider and computes isRetryEligible on the server", async () => {
    const base = {
      channel: "email", subject: "S", body_preview: "B", scheduled_for: null, sent_at: null,
      created_at: "2026-01-01T09:00:00.000Z", segment_criteria: null, profiles: null,
    };
    const selectMock = vi.fn().mockReturnThis();
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: selectMock,
        eq: vi.fn().mockReturnThis(),
        order: vi.fn(async () => ({
          data: [
            { ...base, id: "a", status: "failed", retry_count: 1, error_code: "rate_limited", provider: "resend" },
            { ...base, id: "b", status: "failed", retry_count: 1, error_code: "provider_auth_error", provider: "resend" },
            { ...base, id: "c", status: "failed", retry_count: 3, error_code: "timeout", provider: "sendgrid" },
            { ...base, id: "d", status: "bounced", retry_count: 0, error_code: null, provider: null },
            { ...base, id: "e", status: "sent", retry_count: 0, error_code: null, provider: "resend" },
          ],
          error: null,
        })),
      })),
    });

    const result = await listCommunicationLogsAction();
    expect(selectMock.mock.calls[0][0]).toContain("error_code, provider");
    if (!result.ok) throw new Error("expected ok");
    expect(result.logs.map((l) => [l.id, l.isRetryEligible, l.errorCode, l.provider])).toEqual([
      ["a", true, "rate_limited", "resend"],
      ["b", false, "provider_auth_error", "resend"],
      ["c", false, "timeout", "sendgrid"],
      ["d", false, null, null],
      ["e", false, null, "resend"],
    ]);
  });

  it("AC1: ministry_leader role is denied", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "ministry-leader", church: { id: "church-1" } },
      churchProfileId: "profile-ml", profile: { id: "profile-ml-login"},
      source: "supabase",
      userId: "user-ml",
    });

    const result = await listCommunicationLogsAction();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Access denied.");
  });
});

function adminSession(overrides: Record<string, unknown> = {}) {
  return {
    appContext: { roleId: "church-admin", church: { id: "church-1" } },
    churchProfileId: "profile-admin",
    profile: { id: "profile-admin-login" },
    source: "supabase",
    userId: "admin-login-1",
    ...overrides,
  };
}

describe("suppressContactAction validation and duplicates (S11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    hasTenantBackendEnvMock.mockReturnValue(true);
    requireChurchSessionMock.mockResolvedValue(adminSession());
  });

  it.each(["pastor", "secretary", "ministry-leader", "member"])("denies %s", async (roleId) => {
    requireChurchSessionMock.mockResolvedValue(
      adminSession({ appContext: { roleId, church: { id: "church-1" } } }),
    );
    await expect(
      suppressContactAction({ channel: "email", contact: "a@b.co", reason: "manual" }),
    ).rejects.toThrow("Only church administrators may suppress contacts.");
  });

  it("returns an error for an empty contact, a bad email and a bad phone, writing nothing", async () => {
    const empty = await suppressContactAction({ channel: "email", contact: "   ", reason: "manual" });
    const badEmail = await suppressContactAction({ channel: "email", contact: "not-an-email", reason: "manual" });
    const badPhone = await suppressContactAction({ channel: "sms", contact: "12", reason: "manual" });
    expect(empty).toEqual({ ok: false, error: expect.stringContaining("email address or phone") });
    expect(badEmail).toEqual({ ok: false, error: "Enter a valid email address." });
    expect(badPhone).toEqual({ ok: false, error: "Enter a valid phone number." });
    expect(createTenantAdminClientMock).not.toHaveBeenCalled();
  });

  it("reports a duplicate (unique violation) instead of overwriting the existing reason", async () => {
    const insert = vi.fn(async () => ({ error: { code: "23505", message: "duplicate key" } }));
    createTenantAdminClientMock.mockReturnValueOnce({ from: vi.fn(() => ({ insert })) });
    const result = await suppressContactAction({ channel: "email", contact: "dup@example.com", reason: "manual" });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("already suppressed") });
    expect(insertConsentLogEntriesMock).not.toHaveBeenCalled();
  });

  it("returns other database errors rather than throwing", async () => {
    const insert = vi.fn(async () => ({ error: { code: "XX000", message: "boom" } }));
    createTenantAdminClientMock.mockReturnValueOnce({ from: vi.fn(() => ({ insert })) });
    const result = await suppressContactAction({ channel: "email", contact: "x@example.com", reason: "manual" });
    expect(result).toEqual({ ok: false, error: "boom" });
  });
});

describe("removeSuppressionAction (S11)", () => {
  function clientFor(options: {
    existing?: Record<string, unknown> | null;
    loadError?: { message: string } | null;
    deleted?: Array<{ id: string }>;
    deleteError?: { message: string } | null;
  }) {
    const loadChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: options.existing ?? null, error: options.loadError ?? null })),
    };
    const deleteChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      select: vi.fn(async () => ({ data: options.deleted ?? [{ id: "supp-1" }], error: options.deleteError ?? null })),
    };
    let call = 0;
    const from = vi.fn(() => (call++ === 0 ? loadChain : deleteChain));
    createTenantAdminClientMock.mockReturnValueOnce({ from });
    return { loadChain, deleteChain, from };
  }

  const bounce = { id: "supp-1", channel: "email", contact: "gone@example.com", reason: "bounce", notes: "hard bounce" };

  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    hasTenantBackendEnvMock.mockReturnValue(true);
    requireChurchSessionMock.mockResolvedValue(adminSession());
  });

  it.each(["pastor", "secretary", "ministry-leader", "member"])("denies %s without touching the database", async (roleId) => {
    requireChurchSessionMock.mockResolvedValue(
      adminSession({ appContext: { roleId, church: { id: "church-1" } } }),
    );
    const result = await removeSuppressionAction({ id: "supp-1", reason: "A good reason" });
    expect(result).toEqual({ ok: false, error: "Only church administrators may remove suppressions." });
    expect(createTenantAdminClientMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it("requires a reason of at least 5 characters", async () => {
    const result = await removeSuppressionAction({ id: "supp-1", reason: " abc " });
    expect(result.ok).toBe(false);
    expect(createTenantAdminClientMock).not.toHaveBeenCalled();
  });

  it.each(["unsubscribe", "complaint"])("refuses to remove a %s suppression", async (reason) => {
    const { from } = clientFor({ existing: { ...bounce, reason } });
    const result = await removeSuppressionAction({ id: "supp-1", reason: "Please lift it" });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Only the person can opt back in") });
    expect(from).toHaveBeenCalledTimes(1); // never reached the delete
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it("returns not-found for an id from another church (load is scoped to the session's church)", async () => {
    const { loadChain } = clientFor({ existing: null });
    const result = await removeSuppressionAction({ id: "other-church-id", reason: "Please lift it" });
    expect(result).toEqual({ ok: false, error: "Suppression not found." });
    expect(loadChain.eq).toHaveBeenCalledWith("church_id", "church-1");
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it("deletes a bounce scoped to the church and writes the audit entry with the login id", async () => {
    const { deleteChain } = clientFor({ existing: bounce });
    const result = await removeSuppressionAction({ id: "supp-1", reason: "  Mailbox fixed  " });
    expect(result).toEqual({ ok: true });
    expect(deleteChain.eq).toHaveBeenCalledWith("church_id", "church-1");
    expect(deleteChain.in).toHaveBeenCalledWith("reason", ["bounce", "manual"]);
    expect(logAuditEventMock).toHaveBeenCalledWith({
      tableName: "communication_suppressions",
      recordId: "supp-1",
      operation: "DELETE",
      actorId: "admin-login-1",
      churchId: "church-1",
      actorRole: "church-admin",
      oldValues: {
        channel: "email",
        reason: "bounce",
        contact: "gone@example.com",
        notes: "hard bounce",
        removal_reason: "Mailbox fixed",
      },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/communications/suppressions");
  });

  it("removes a manual suppression", async () => {
    clientFor({ existing: { ...bounce, reason: "manual" } });
    expect(await removeSuppressionAction({ id: "supp-1", reason: "Added by mistake" })).toEqual({ ok: true });
  });

  it("returns the database error and writes no audit entry when the delete fails", async () => {
    clientFor({ existing: bounce, deleteError: { message: "delete failed" } });
    const result = await removeSuppressionAction({ id: "supp-1", reason: "Mailbox fixed" });
    expect(result).toEqual({ ok: false, error: "delete failed" });
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it("reports not-found when the delete matched no row (row vanished or turned locked)", async () => {
    clientFor({ existing: bounce, deleted: [] });
    const result = await removeSuppressionAction({ id: "supp-1", reason: "Mailbox fixed" });
    expect(result).toEqual({ ok: false, error: "Suppression not found." });
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it("surfaces a load error", async () => {
    clientFor({ loadError: { message: "load failed" } });
    expect(await removeSuppressionAction({ id: "supp-1", reason: "Mailbox fixed" })).toEqual({
      ok: false,
      error: "load failed",
    });
  });

  it("reports an audit failure loudly after the delete", async () => {
    clientFor({ existing: bounce });
    logAuditEventMock.mockRejectedValueOnce(new Error("audit down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await removeSuppressionAction({ id: "supp-1", reason: "Mailbox fixed" });
    expect(result).toEqual({
      ok: false,
      error: expect.stringMatching(/removed and the removal was recorded.*detailed audit entry.*platform team/),
    });
    errorSpy.mockRestore();
  });
});
