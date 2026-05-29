import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  shouldUseLocalTenantFallbackMock,
  queryTenantLocalDbMock,
  createTenantServerClientMock,
  insertConsentLogEntriesMock,
} = vi.hoisted(() => ({
  shouldUseLocalTenantFallbackMock: vi.fn(),
  queryTenantLocalDbMock: vi.fn(),
  createTenantServerClientMock: vi.fn(),
  insertConsentLogEntriesMock: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  createTenantServerClient: createTenantServerClientMock,
}));

vi.mock("@/lib/consent-log", () => ({
  insertConsentLogEntries: insertConsentLogEntriesMock,
}));

import { recordProviderWebhookEvent } from "@/lib/communications/webhook-events";

describe("recordProviderWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
  });

  it("adds suppression and consent log for bounced events", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [{ id: "log-1", church_id: "church-1", recipient_id: "profile-1" }],
      })
      .mockResolvedValueOnce({ rows: [{ id: "delivery-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await recordProviderWebhookEvent({
      event: {
        provider: "sendgrid",
        channel: "email",
        eventId: "evt-1",
        providerMessageId: "msg-1",
        status: "bounced",
        occurredAtIso: "2026-05-28T00:00:00.000Z",
        recipient: "Member@Example.com",
        reason: "Mailbox unavailable",
      },
      rawBody: JSON.stringify([{ event: "bounce" }]),
    });

    expect(result.recorded).toBe(true);
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.communication_suppressions"),
      [
        "church-1",
        "email",
        "member@example.com",
        "bounce",
        "Mailbox unavailable",
      ],
    );
    expect(insertConsentLogEntriesMock).toHaveBeenCalledWith([
      {
        churchId: "church-1",
        profileId: "profile-1",
        consentType: "communication_suppression",
        consented: false,
        communicationType: "email",
      },
    ]);
  });

  it("does not add suppression for delivered events", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [{ id: "log-1", church_id: "church-1", recipient_id: "profile-1" }],
      })
      .mockResolvedValueOnce({ rows: [{ id: "delivery-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await recordProviderWebhookEvent({
      event: {
        provider: "twilio",
        channel: "sms",
        eventId: "evt-2",
        providerMessageId: "msg-2",
        status: "delivered",
        occurredAtIso: "2026-05-28T00:00:00.000Z",
        recipient: "+15555550100",
      },
      rawBody: "MessageStatus=delivered",
    });

    expect(result.recorded).toBe(true);
    expect(queryTenantLocalDbMock).not.toHaveBeenCalledWith(
      expect.stringContaining("insert into public.communication_suppressions"),
      expect.anything(),
    );
    expect(insertConsentLogEntriesMock).not.toHaveBeenCalled();
  });
});
