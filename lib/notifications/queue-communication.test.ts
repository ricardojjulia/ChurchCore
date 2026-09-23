import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  sendgridAdapterSendMock,
  twilioAdapterSendMock,
  generateUnsubscribeLinkMock,
  createTenantAdminClientMock,
  createTenantServerClientMock,
  webpushSendNotificationMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  queryTenantLocalDbMock: vi.fn(),
  shouldUseLocalTenantFallbackMock: vi.fn(),
  sendgridAdapterSendMock: vi.fn(),
  twilioAdapterSendMock: vi.fn(),
  generateUnsubscribeLinkMock: vi.fn(),
  createTenantAdminClientMock: vi.fn(),
  createTenantServerClientMock: vi.fn(),
  webpushSendNotificationMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  createTenantServerClient: createTenantServerClientMock,
  createTenantAdminClient: createTenantAdminClientMock,
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: webpushSendNotificationMock,
  },
}));

vi.mock("@/lib/communications/sendgrid-adapter", () => ({
  sendgridAdapter: { send: sendgridAdapterSendMock },
}));

vi.mock("@/lib/communications/twilio-adapter", () => ({
  twilioAdapter: { send: twilioAdapterSendMock },
}));

vi.mock("@/lib/communications/unsubscribe", () => ({
  generateUnsubscribeLink: generateUnsubscribeLinkMock,
}));

import { queueCommunicationAction } from "@/lib/notifications/queue-communication";

function makeSession(churchId = "church-1", profileId: string | null = "profile-1") {
  return {
    appContext: { church: { id: churchId } },
    profile: { id: profileId },
  } as never;
}

describe("queueCommunicationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    // Simulate consent opt-in by default (no prefs row → email/push on)
    queryTenantLocalDbMock.mockResolvedValue({ rows: [] });
  });

  describe("email dispatch with UNSUBSCRIBE_SECRET set", () => {
    beforeEach(() => {
      vi.stubEnv("UNSUBSCRIBE_SECRET", "test-secret-key");
      generateUnsubscribeLinkMock.mockReturnValue(
        "https://example.com/api/unsubscribe?t=9999&cid=church-1&e=member%40example.com&ch=email&sig=abc",
      );
      sendgridAdapterSendMock.mockResolvedValue({
        accepted: true,
        providerMessageId: "sg-msg-1",
      });
      // consent prefs check then writeLog insert
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [] })          // checkOptIn: no prefs → email on
        .mockResolvedValueOnce({ rows: [{ id: "log-1" }] }); // writeLog
    });

    it("sendgridAdapter.send receives body and html containing unsubscribe link", async () => {
      await queueCommunicationAction({
        session: makeSession(),
        recipientProfileId: "profile-2",
        recipientContact: "member@example.com",
        channel: "email",
        subject: "Newsletter",
        body: "Hello church member",
        html: "<p>Hello church member</p>",
      });

      expect(sendgridAdapterSendMock).toHaveBeenCalledTimes(1);
      const sendArgs = sendgridAdapterSendMock.mock.calls[0][0];
      expect(sendArgs.body).toContain("To unsubscribe:");
      expect(sendArgs.body).toContain("https://example.com/api/unsubscribe");
      expect(sendArgs.html).toContain("click here");
      expect(sendArgs.html).toContain("https://example.com/api/unsubscribe");
    });

    it("writeLog body_preview uses original body WITHOUT unsubscribe footer", async () => {
      const originalBody = "Hello church member";

      await queueCommunicationAction({
        session: makeSession(),
        recipientProfileId: "profile-2",
        recipientContact: "member@example.com",
        channel: "email",
        subject: "Newsletter",
        body: originalBody,
      });

      // The writeLog call is the second queryTenantLocalDb call (first is checkOptIn)
      const writeLogArgs = queryTenantLocalDbMock.mock.calls[1][1];
      // body_preview is the 6th param ($6)
      const bodyPreview = writeLogArgs[5];
      expect(bodyPreview).toBe(originalBody.slice(0, 500));
      expect(bodyPreview).not.toContain("unsubscribe");
    });

    it("generateUnsubscribeLink is called with correct church and contact", async () => {
      await queueCommunicationAction({
        session: makeSession("church-abc"),
        recipientProfileId: "profile-2",
        recipientContact: "test@test.com",
        channel: "email",
        subject: "Test",
        body: "Body",
      });

      expect(generateUnsubscribeLinkMock).toHaveBeenCalledWith(
        "church-abc",
        "test@test.com",
        "email",
      );
    });
  });

  describe("SMS dispatch", () => {
    beforeEach(() => {
      vi.stubEnv("UNSUBSCRIBE_SECRET", "test-secret-key");
      twilioAdapterSendMock.mockResolvedValue({
        accepted: true,
        providerMessageId: "tw-msg-1",
      });
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ opted_in: true }] }) // checkOptIn sms
        .mockResolvedValueOnce({ rows: [{ id: "log-1" }] });   // writeLog
    });

    it("twilioAdapter.send called with original body — no unsubscribe text", async () => {
      await queueCommunicationAction({
        session: makeSession(),
        recipientProfileId: "profile-2",
        recipientContact: "+15551234567",
        channel: "sms",
        body: "Short SMS body",
      });

      expect(twilioAdapterSendMock).toHaveBeenCalledTimes(1);
      const smsArgs = twilioAdapterSendMock.mock.calls[0][0];
      expect(smsArgs.body).toBe("Short SMS body");
      expect(smsArgs.body).not.toContain("unsubscribe");
      expect(generateUnsubscribeLinkMock).not.toHaveBeenCalled();
    });

    it("sendgridAdapter.send is NOT called for SMS", async () => {
      await queueCommunicationAction({
        session: makeSession(),
        recipientProfileId: "profile-2",
        recipientContact: "+15551234567",
        channel: "sms",
        body: "Short SMS body",
      });

      expect(sendgridAdapterSendMock).not.toHaveBeenCalled();
    });
  });

  describe("missing UNSUBSCRIBE_SECRET for email", () => {
    beforeEach(() => {
      vi.stubEnv("UNSUBSCRIBE_SECRET", "");
      // Mock generateUnsubscribeLink to throw as it would when secret is missing
      generateUnsubscribeLinkMock.mockImplementation(() => {
        throw new Error("UNSUBSCRIBE_SECRET is not configured");
      });
      queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] }); // checkOptIn
    });

    it("throws before adapter.send when UNSUBSCRIBE_SECRET is missing", async () => {
      await expect(
        queueCommunicationAction({
          session: makeSession(),
          recipientProfileId: "profile-2",
          recipientContact: "member@example.com",
          channel: "email",
          subject: "Test",
          body: "Hello",
        }),
      ).rejects.toThrow("UNSUBSCRIBE_SECRET must be configured before sending emails.");

      expect(sendgridAdapterSendMock).not.toHaveBeenCalled();
    });
  });

  describe("scheduled email (scheduledFor set in future)", () => {
    beforeEach(() => {
      vi.stubEnv("UNSUBSCRIBE_SECRET", "test-secret-key");
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [] })           // checkOptIn
        .mockResolvedValueOnce({ rows: [{ id: "log-sched" }] }); // writeLog
    });

    it("adapter.send NOT called for future-scheduled email", async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const result = await queueCommunicationAction({
        session: makeSession(),
        recipientProfileId: "profile-2",
        recipientContact: "member@example.com",
        channel: "email",
        subject: "Future Newsletter",
        body: "Scheduled body",
        scheduledFor: future,
      });

      expect(sendgridAdapterSendMock).not.toHaveBeenCalled();
      expect(generateUnsubscribeLinkMock).not.toHaveBeenCalled();
      expect(result.sent).toBe(false);
    });

    it("writeLog body_preview uses original body for scheduled send", async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const originalBody = "Scheduled body content";

      await queueCommunicationAction({
        session: makeSession(),
        recipientProfileId: "profile-2",
        recipientContact: "member@example.com",
        channel: "email",
        subject: "Future Newsletter",
        body: originalBody,
        scheduledFor: future,
      });

      const writeLogArgs = queryTenantLocalDbMock.mock.calls[1][1];
      const bodyPreview = writeLogArgs[5];
      expect(bodyPreview).toBe(originalBody.slice(0, 500));
      expect(bodyPreview).not.toContain("unsubscribe");
    });
  });

  describe("push channel dispatch", () => {
    it("skips push dispatch when VAPID keys missing", async () => {
      process.env.UNSUBSCRIBE_SECRET = "test-secret";

      const result = await queueCommunicationAction({
        session: makeSession(),
        recipientProfileId: "profile-1",
        recipientContact: "device-endpoint",
        channel: "push",
        body: "You have a new update",
      });

      expect(result.sent).toBe(true);
      expect(webpushSendNotificationMock).not.toHaveBeenCalled();
    });

    it("dispatches push to subscriptions via local DB when VAPID keys set", async () => {
      process.env.VAPID_PUBLIC_KEY = "BTest...";
      process.env.VAPID_PRIVATE_KEY = "PrivTest...";
      process.env.UNSUBSCRIBE_SECRET = "test-secret";

      // consent check → no prefs (default opted in); subscriptions query; writeLog
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            { endpoint: "https://push.example.com/1", p256dh: "key1", auth_secret: "auth1" },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: "log-1" }] });

      webpushSendNotificationMock.mockResolvedValue({ statusCode: 201 });

      await queueCommunicationAction({
        session: makeSession(),
        recipientProfileId: "profile-1",
        recipientContact: "device-endpoint",
        channel: "push",
        body: "Test push body",
        subject: "Test Title",
      });

      expect(webpushSendNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: "https://push.example.com/1" }),
        expect.stringContaining("Test push body"),
      );

      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;
    });
  });

  describe("recordLog: false (retry cron owns the source log row)", () => {
    beforeEach(() => {
      vi.stubEnv("UNSUBSCRIBE_SECRET", "test-secret-key");
      generateUnsubscribeLinkMock.mockReturnValue("https://example.com/api/unsubscribe?sig=abc");
    });

    it("dispatches without inserting a communication_logs row and returns code and message separately", async () => {
      sendgridAdapterSendMock.mockResolvedValue({
        accepted: false,
        errorCode: "timeout",
        errorMessage: "Request timed out",
      });

      const result = await queueCommunicationAction({
        session: makeSession(),
        recipientProfileId: "profile-2",
        recipientContact: "member@example.com",
        channel: "email",
        body: "Hello",
        retryCount: 2,
        recordLog: false,
      });

      expect(sendgridAdapterSendMock).toHaveBeenCalledTimes(1);
      // Only the consent lookup touched the DB — no writeLog insert.
      expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(1);
      expect(queryTenantLocalDbMock.mock.calls[0][0]).not.toContain("insert into");
      expect(result).toMatchObject({
        sent: false,
        logId: undefined,
        provider: "sendgrid",
        error: "Request timed out",
        errorCode: "timeout",
      });
    });
  });

  // ── Supabase path (production) — ADR 0022 ──────────────────────────────────
  describe("Supabase path: consent and audit log via the admin client", () => {
    function mockAdmin(options: {
      prefs?: Record<string, boolean> | null;
      prefsError?: { message: string } | null;
      insertError?: { message: string } | null;
    }) {
      const prefsEq = vi.fn();
      const prefsChain = {
        eq: prefsEq,
        maybeSingle: vi.fn().mockResolvedValue({ data: options.prefs ?? null, error: options.prefsError ?? null }),
      };
      prefsEq.mockReturnValue(prefsChain);
      const insertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(
            options.insertError
              ? { data: null, error: options.insertError }
              : { data: { id: "log-admin" }, error: null },
          ),
        }),
      });
      createTenantAdminClientMock.mockReturnValue({
        from: vi.fn((table: string) =>
          table === "notification_preferences"
            ? { select: vi.fn().mockReturnValue(prefsChain) }
            : { insert: insertMock },
        ),
      });
      return { prefsEq, insertMock };
    }

    beforeEach(() => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(false);
      twilioAdapterSendMock.mockResolvedValue({ accepted: true, providerMessageId: "tw-1" });
    });

    it("honours an SMS opt-in the sender's RLS could not see (no user session)", async () => {
      const { prefsEq, insertMock } = mockAdmin({ prefs: { sms_opt_in: true } });

      const result = await queueCommunicationAction({
        session: makeSession("church-1", null),
        recipientProfileId: "profile-2",
        recipientContact: "+15555550100",
        channel: "sms",
        body: "Service moved to 11am",
      });

      expect(result).toMatchObject({ sent: true, logId: "log-admin" });
      expect(twilioAdapterSendMock).toHaveBeenCalledTimes(1);
      expect(createTenantServerClientMock).not.toHaveBeenCalled();
      expect(prefsEq).toHaveBeenCalledWith("church_id", "church-1");
      expect(prefsEq).toHaveBeenCalledWith("profile_id", "profile-2");
      expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ church_id: "church-1", status: "sent" }));
    });

    it("honours an email opt-out instead of defaulting to opted in", async () => {
      vi.stubEnv("UNSUBSCRIBE_SECRET", "test-secret-key");
      mockAdmin({ prefs: { email_opt_in: false } });

      const result = await queueCommunicationAction({
        session: makeSession("church-1", null),
        recipientProfileId: "profile-2",
        recipientContact: "member@example.com",
        channel: "email",
        body: "Hello",
      });

      expect(result).toMatchObject({ sent: false, skipped: true, skipCode: "opted_out" });
      expect(sendgridAdapterSendMock).not.toHaveBeenCalled();
    });

    it("fails closed when the consent record cannot be read", async () => {
      mockAdmin({ prefsError: { message: "permission denied" } });

      await expect(
        queueCommunicationAction({
          session: makeSession("church-1", null),
          recipientProfileId: "profile-2",
          recipientContact: "+15555550100",
          channel: "sms",
          body: "Hello",
        }),
      ).rejects.toThrow("Failed to read notification preferences");
      expect(twilioAdapterSendMock).not.toHaveBeenCalled();
    });

    it("logs, but does not throw, when the audit-log insert fails after a send", async () => {
      mockAdmin({ prefs: { sms_opt_in: true }, insertError: { message: "insert failed" } });
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await queueCommunicationAction({
        session: makeSession("church-1", null),
        recipientProfileId: "profile-2",
        recipientContact: "+15555550100",
        channel: "sms",
        body: "Hello",
      });

      expect(result).toMatchObject({ sent: true, logId: undefined });
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("insert failed"));
      consoleErrorSpy.mockRestore();
    });
  });
});
