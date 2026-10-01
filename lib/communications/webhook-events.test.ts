import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  shouldUseLocalTenantFallbackMock,
  queryTenantLocalDbMock,
  createTenantServerClientMock,
  createTenantAdminClientMock,
  insertConsentLogEntriesMock,
} = vi.hoisted(() => ({
  shouldUseLocalTenantFallbackMock: vi.fn(),
  queryTenantLocalDbMock: vi.fn(),
  createTenantServerClientMock: vi.fn(),
  createTenantAdminClientMock: vi.fn(),
  insertConsentLogEntriesMock: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  createTenantServerClient: createTenantServerClientMock,
  createTenantAdminClient: createTenantAdminClientMock,
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

// S2 (F4): webhooks have no user session, so the request client was anon and
// every write below failed. The Supabase path now uses the admin client,
// scoped to the church of the log the message id resolves to.
type Call = { table: string; op: string; args: unknown[] };

function fakeAdmin(
  log: { id: string; church_id: string; recipient_id: string | null } | null,
  logColumn = "provider_message_id",
  options: { eventExists?: boolean; suppressionExists?: boolean; failSuppression?: boolean } = {},
) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let op = "select";
      let payload: unknown;
      const builder = {
        select: vi.fn(() => builder),
        insert: vi.fn((value: unknown) => ((op = "insert"), (payload = value), builder)),
        update: vi.fn((value: unknown) => ((op = "update"), (payload = value), builder)),
        upsert: vi.fn((value: unknown, upsertOptions: unknown) => {
          calls.push({ table, op: "upsert", args: [value, upsertOptions] });
          return {
            select: vi.fn(async () =>
              options.failSuppression
                ? { data: null, error: { message: "suppression write failed" } }
                : { data: options.suppressionExists ? [] : [{ id: "suppression-1" }], error: null },
            ),
          };
        }),
        eq: vi.fn((column: string, value: unknown) => (filters.push([column, value]), builder)),
        or: vi.fn(() => {
          throw new Error("no .or() filter strings: the message id comes from the request body");
        }),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => {
          calls.push({ table, op, args: [payload, filters] });
          if (table === "communication_logs") {
            return { data: filters[0]?.[0] === logColumn ? log : null, error: null };
          }
          // communication_delivery_events: has this event been processed?
          return { data: options.eventExists ? { id: "delivery-1" } : null, error: null };
        }),
        then(resolve: (value: unknown) => void) {
          calls.push({ table, op, args: [payload, filters] });
          resolve({ error: null });
        },
      };
      return builder;
    },
  };
  return { client, calls };
}

const bounce = {
  provider: "resend" as const,
  channel: "email" as const,
  eventId: "evt-1",
  providerMessageId: "msg-1",
  status: "bounced" as const,
  occurredAtIso: "2026-10-01T00:00:00.000Z",
  recipient: "Member@Example.com",
  reason: "Mailbox unavailable",
};

describe("recordProviderWebhookEvent on Supabase (S2, F4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
  });

  it("writes the event, log status, suppression and consent row through the admin client, scoped to the log's church", async () => {
    const admin = fakeAdmin({ id: "log-1", church_id: "church-1", recipient_id: "profile-1" });
    createTenantAdminClientMock.mockReturnValue(admin.client);

    const result = await recordProviderWebhookEvent({ event: bounce, rawBody: JSON.stringify({ type: "email.bounced" }) });

    expect(result).toEqual({ recorded: true, churchId: "church-1", communicationLogId: "log-1" });
    expect(createTenantServerClientMock).not.toHaveBeenCalled();
    expect(insertConsentLogEntriesMock).not.toHaveBeenCalled();

    const lookup = admin.calls.find((c) => c.table === "communication_logs" && c.op === "select");
    expect(lookup?.args[1]).toEqual([["provider_message_id", "msg-1"]]);

    const event = admin.calls.find((c) => c.table === "communication_delivery_events" && c.op === "insert");
    expect(event?.args[0]).toMatchObject({ church_id: "church-1", communication_log_id: "log-1", status: "bounced" });

    const logUpdate = admin.calls.find((c) => c.table === "communication_logs" && c.op === "update");
    expect(logUpdate?.args[1]).toEqual([["church_id", "church-1"], ["id", "log-1"]]);

    const suppression = admin.calls.find((c) => c.table === "communication_suppressions");
    expect(suppression?.args[0]).toMatchObject({ church_id: "church-1", channel: "email", contact: "member@example.com", reason: "bounce" });

    const consent = admin.calls.find((c) => c.table === "consent_logs");
    expect(consent?.args[0]).toMatchObject({ church_id: "church-1", profile_id: "profile-1", consented: false });
  });

  it("falls back to external_id with a second exact match, and records nothing for an unknown message", async () => {
    const byExternal = fakeAdmin({ id: "log-2", church_id: "church-2", recipient_id: null }, "external_id");
    createTenantAdminClientMock.mockReturnValue(byExternal.client);
    expect((await recordProviderWebhookEvent({ event: bounce, rawBody: "{}" })).churchId).toBe("church-2");

    const unknown = fakeAdmin(null);
    createTenantAdminClientMock.mockReturnValue(unknown.client);
    expect(await recordProviderWebhookEvent({ event: bounce, rawBody: "{}" })).toEqual({ recorded: false });
    expect(unknown.calls.filter((c) => c.op !== "select")).toEqual([]);
  });

  it("stores a Twilio form body as JSON instead of throwing on it", async () => {
    const admin = fakeAdmin({ id: "log-3", church_id: "church-1", recipient_id: null });
    createTenantAdminClientMock.mockReturnValue(admin.client);

    await recordProviderWebhookEvent({
      event: { ...bounce, provider: "twilio", channel: "sms", status: "unsubscribed", recipient: "+15555550101" },
      rawBody: "MessageSid=SM1&MessageStatus=undelivered&ErrorCode=21610&To=%2B15555550101",
    });

    const event = admin.calls.find((c) => c.table === "communication_delivery_events" && c.op === "insert");
    expect((event?.args[0] as { raw_payload: unknown }).raw_payload).toEqual({
      MessageSid: "SM1",
      MessageStatus: "undelivered",
      ErrorCode: "21610",
      To: "+15555550101",
    });
    const suppression = admin.calls.find((c) => c.table === "communication_suppressions");
    expect(suppression?.args[0]).toMatchObject({ channel: "sms", contact: "+15555550101", reason: "unsubscribe" });
  });

  it("writes the delivery-event row last, so a retry after a failed suppression resumes instead of stopping (PR #166 review)", async () => {
    const failing = fakeAdmin({ id: "log-1", church_id: "church-1", recipient_id: "profile-1" }, "provider_message_id", {
      failSuppression: true,
    });
    createTenantAdminClientMock.mockReturnValue(failing.client);
    await expect(recordProviderWebhookEvent({ event: bounce, rawBody: "{}" })).rejects.toThrow("suppression write failed");
    expect(failing.calls.some((c) => c.table === "communication_delivery_events" && c.op === "insert")).toBe(false);

    // The provider retries: no event row exists yet, so every step runs again.
    const retry = fakeAdmin({ id: "log-1", church_id: "church-1", recipient_id: "profile-1" });
    createTenantAdminClientMock.mockReturnValue(retry.client);
    expect((await recordProviderWebhookEvent({ event: bounce, rawBody: "{}" })).recorded).toBe(true);
    const order = retry.calls.filter((c) => c.op !== "select").map((c) => c.table);
    expect(order).toEqual(["communication_logs", "communication_suppressions", "consent_logs", "communication_delivery_events"]);
  });

  it("skips an event already processed, and writes no second consent row for an existing suppression", async () => {
    const processed = fakeAdmin({ id: "log-1", church_id: "church-1", recipient_id: "profile-1" }, "provider_message_id", {
      eventExists: true,
    });
    createTenantAdminClientMock.mockReturnValue(processed.client);
    expect((await recordProviderWebhookEvent({ event: bounce, rawBody: "{}" })).recorded).toBe(false);
    expect(processed.calls.filter((c) => c.op !== "select")).toEqual([]);

    const alreadySuppressed = fakeAdmin({ id: "log-1", church_id: "church-1", recipient_id: "profile-1" }, "provider_message_id", {
      suppressionExists: true,
    });
    createTenantAdminClientMock.mockReturnValue(alreadySuppressed.client);
    await recordProviderWebhookEvent({ event: bounce, rawBody: "{}" });
    expect(alreadySuppressed.calls.some((c) => c.table === "consent_logs")).toBe(false);
  });
});
