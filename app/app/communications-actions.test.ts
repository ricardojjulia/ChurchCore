import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  hasTenantBackendEnvMock,
  createTenantServerClientMock,
  insertConsentLogEntriesMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();
  const hasTenantBackendEnv = vi.fn();
  const createTenantServerClient = vi.fn();
  const insertConsentLogEntries = vi.fn();

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    hasTenantBackendEnvMock: hasTenantBackendEnv,
    createTenantServerClientMock: createTenantServerClient,
    insertConsentLogEntriesMock: insertConsentLogEntries,
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

import { updateNotificationPreferencesAction } from "@/app/app/communications-actions";

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
});
