import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createTenantAdminClientMock, resolveRecipientsMock, sendWithSuppressionMock } = vi.hoisted(
  () => ({
    createTenantAdminClientMock: vi.fn(),
    resolveRecipientsMock: vi.fn(),
    sendWithSuppressionMock: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/tenant", () => ({
  hasTenantBackendEnv: () => true,
  hasTenantAdminBackendEnv: () => true,
  shouldUseLocalTenantFallback: () => false,
  createTenantAdminClient: createTenantAdminClientMock,
}));

vi.mock("@/lib/communications/recipient-resolver", () => ({
  resolveRecipients: resolveRecipientsMock,
}));

vi.mock("@/lib/communications/send-with-suppression", () => ({
  sendWithSuppression: sendWithSuppressionMock,
}));

import { GET } from "@/app/api/cron/communications-scheduled/route";

const dueLog = {
  id: "log-sched",
  church_id: "church-1",
  channel: "email",
  subject: "Sunday",
  body_preview: "See you Sunday",
  segment_criteria: {},
  scheduled_for: "2026-09-23T00:00:00.000Z",
};

/** Admin client: due-row query, "sending" lock, then the close-out update (captured). */
function mockAdmin() {
  const closeOut: Array<Record<string, unknown>> = [];
  createTenantAdminClientMock.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ lte: vi.fn(async () => ({ data: [dueLog], error: null })) })),
      })),
      update: vi.fn((payload: Record<string, unknown>) => {
        if (payload.status !== "sending") closeOut.push(payload);
        const chain = { eq: vi.fn(() => chain), then: (resolve: (v: unknown) => void) => resolve({ error: null }) };
        return chain;
      }),
    })),
  });
  return { closeOut };
}

function cronRequest() {
  return new NextRequest("http://localhost/api/cron/communications-scheduled", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

describe("GET /api/cron/communications-scheduled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
  });

  it("marks the broadcast sent when at least one recipient was delivered", async () => {
    const { closeOut } = mockAdmin();
    resolveRecipientsMock.mockResolvedValue([
      { profileId: "p-1", name: "A", contact: "a@example.com" },
      { profileId: "p-2", name: "B", contact: "b@example.com" },
    ]);
    sendWithSuppressionMock
      .mockResolvedValueOnce({ sent: true, skipped: false })
      .mockResolvedValueOnce({ sent: false, skipped: true });

    const response = await GET(cronRequest());

    expect(response.status).toBe(200);
    expect(closeOut[0]).toMatchObject({ status: "sent" });
  });

  it("marks the broadcast failed — not sent — when nobody matched", async () => {
    const { closeOut } = mockAdmin();
    resolveRecipientsMock.mockResolvedValue([]);

    await GET(cronRequest());

    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
    expect(closeOut[0]).toMatchObject({ status: "failed", error_code: "no_delivery" });
    expect(String(closeOut[0].error_message)).toContain("0 matched");
  });

  it("marks the broadcast failed when every recipient was skipped or errored", async () => {
    const { closeOut } = mockAdmin();
    resolveRecipientsMock.mockResolvedValue([
      { profileId: "p-1", name: "A", contact: "a@example.com" },
      { profileId: "p-2", name: "B", contact: "b@example.com" },
    ]);
    sendWithSuppressionMock
      .mockResolvedValueOnce({ sent: false, skipped: true })
      .mockRejectedValueOnce(new Error("Failed to read notification preferences"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await GET(cronRequest());

    expect(closeOut[0]).toMatchObject({ status: "failed", error_code: "no_delivery" });
    expect(String(closeOut[0].error_message)).toContain("1 skipped, 1 failed");
    consoleErrorSpy.mockRestore();
  });
});
