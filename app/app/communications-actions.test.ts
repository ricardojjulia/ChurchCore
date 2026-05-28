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
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();
  const hasTenantBackendEnv = vi.fn();
  const createTenantServerClient = vi.fn();
  const insertConsentLogEntries = vi.fn();
  const sendWithSuppression = vi.fn();

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    hasTenantBackendEnvMock: hasTenantBackendEnv,
    createTenantServerClientMock: createTenantServerClient,
    insertConsentLogEntriesMock: insertConsentLogEntries,
    sendWithSuppressionMock: sendWithSuppression,
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

import {
  retryCommunicationAction,
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

  it("denies secretary role from retry and suppression actions", async () => {
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "secretary", church: { id: "church-1" } },
      profile: { id: "profile-1" },
      source: "supabase",
      userId: "user-1",
    });

    await expect(retryCommunicationAction({ logId: "log-1" })).rejects.toThrow(
      "Only pastors and church administrators may retry communications.",
    );

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
});
