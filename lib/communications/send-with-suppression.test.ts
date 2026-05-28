import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  shouldUseLocalTenantFallbackMock,
  queryTenantLocalDbMock,
  queueCommunicationActionMock,
} = vi.hoisted(() => ({
  shouldUseLocalTenantFallbackMock: vi.fn(),
  queryTenantLocalDbMock: vi.fn(),
  queueCommunicationActionMock: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  createTenantServerClient: vi.fn(),
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
