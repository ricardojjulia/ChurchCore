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
  resolveRecipientsMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();
  const hasTenantBackendEnv = vi.fn();
  const createTenantServerClient = vi.fn();
  const insertConsentLogEntries = vi.fn();
  const sendWithSuppression = vi.fn();
  const retryEligibleCommunications = vi.fn();
  const resolveRecipients = vi.fn();

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
    resolveRecipientsMock: resolveRecipients,
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
}));

vi.mock("@/lib/consent-log", () => ({
  insertConsentLogEntries: insertConsentLogEntriesMock,
}));

vi.mock("@/lib/communications/send-with-suppression", () => ({
  sendWithSuppression: sendWithSuppressionMock,
}));

vi.mock("@/lib/communications/retry-eligible", () => ({
  retryEligibleCommunications: retryEligibleCommunicationsMock,
}));

vi.mock("@/lib/communications/recipient-resolver", () => ({
  resolveRecipients: resolveRecipientsMock,
}));

import {
  broadcastMessageAction,
  cancelScheduledMessageAction,
  composeAndSendMessageAction,
  getMessageAnalyticsAction,
  listCommunicationLogsAction,
  retryCommunicationAction,
  retryAllEligibleAction,
  suppressContactAction,
  updateNotificationPreferencesAction,
} from "@/app/app/communications-actions";

describe("communications actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "member", church: { id: "church-1" } },
      profile: { id: "profile-1" },
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
      profile: { id: "profile-1" },
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
      profile: { id: "profile-admin" },
      source: "supabase",
      userId: "admin-1",
    });

    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [] })
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
      profile: { id: "profile-pastor" },
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
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });

  it("retries eligible failed communication", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "pastor", church: { id: "church-1" } },
      profile: { id: "profile-pastor" },
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

    sendWithSuppressionMock.mockResolvedValue({ sent: true, skipped: false });

    const result = await retryCommunicationAction({ logId: "log-1" });
    expect(result).toEqual({ retried: true });
    expect(sendWithSuppressionMock).toHaveBeenCalledTimes(1);
  });

  it("rejects retry when the communication log is outside the active church scope", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "pastor", church: { id: "church-1" } },
      profile: { id: "profile-pastor" },
      source: "supabase",
      userId: "pastor-1",
    });

    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    await expect(retryCommunicationAction({ logId: "foreign-log" })).rejects.toThrow(
      "Communication log not found.",
    );
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });

  it("does not write suppression consent when no in-church profile matches", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      profile: { id: "profile-admin" },
      source: "supabase",
      userId: "admin-1",
    });

    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [] })
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

  it("rejects email broadcast without subject", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "pastor", church: { id: "church-1" } },
      profile: { id: "profile-pastor" },
      source: "supabase",
      userId: "pastor-1",
    });

    await expect(
      broadcastMessageAction(
        [
          {
            profileId: "profile-2",
            name: "Member",
            email: "member@example.com",
            phone: null,
            role: "member",
            ministries: [],
            emailOptIn: true,
            smsOptIn: false,
          },
        ],
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
      profile: { id: "profile-pastor" },
      source: "supabase",
      userId: "pastor-1",
    });

    await expect(
      broadcastMessageAction(
        [
          {
            profileId: "profile-2",
            name: "Member",
            email: "member@example.com",
            phone: null,
            role: "member",
            ministries: [],
            emailOptIn: true,
            smsOptIn: false,
          },
        ],
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
      profile: { id: "profile-pastor" },
      source: "supabase",
      userId: "pastor-1",
    });

    sendWithSuppressionMock.mockResolvedValue({ sent: true, skipped: false });

    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const result = await broadcastMessageAction(
      [
        {
          profileId: "profile-2",
          name: "Member",
          email: "member@example.com",
          phone: null,
          role: "member",
          ministries: [],
          emailOptIn: true,
          smsOptIn: false,
        },
      ],
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
      profile: { id: "profile-1" },
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
      profile: { id: "profile-1" },
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
      profile: { id: "profile-pastor" },
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
      profile: { id: "profile-admin" },
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
      profile: { id: "profile-actor" },
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
      profile: { id: "profile-ml" },
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

describe("CC-COMM-001: cancelScheduledMessageAction (actions.test)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    hasTenantBackendEnvMock.mockReturnValue(true);
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      profile: { id: "profile-actor" },
      source: "supabase",
      userId: "user-actor",
    });
  });

  it("AC11: cancels a scheduled log → status becomes cancelled", async () => {
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        })),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({
          data: { id: "log-1", status: "scheduled", church_id: "church-1" },
          error: null,
        })),
      })),
    });

    const result = await cancelScheduledMessageAction("log-1");
    expect(result.ok).toBe(true);
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
      profile: { id: "profile-actor" },
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
      profile: { id: "profile-ml" },
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
      profile: { id: "profile-actor" },
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

  it("AC1: ministry_leader role is denied", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "ministry-leader", church: { id: "church-1" } },
      profile: { id: "profile-ml" },
      source: "supabase",
      userId: "user-ml",
    });

    const result = await listCommunicationLogsAction();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Access denied.");
  });
});
