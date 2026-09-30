import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sibling test file for G1.5 (assignment notifications): assignVolunteerAction
// and sendVolunteerReminderAction create the shift's own confirm link and
// message the volunteer through sendWithSuppression. Message wording and
// channel rules are covered in lib/volunteer-notifications.test.ts.
//
// Council Review 23: the token is read and written only through the admin
// client (members can't SELECT it), a volunteer who prefers texts but never
// opted in is emailed instead, a missing provider or app URL is reported
// rather than claimed as sent, and Remind records only what was sent. The
// login id is never the church profile id here (S7).

const { requireChurchSessionMock, sendWithSuppressionMock, tableResults, calls, clientFor } = vi.hoisted(() => {
  const tableResults = new Map<string, Array<{ data?: unknown; error?: unknown; count?: number }>>();
  const calls: Array<{ client: string; table: string; method: string; args: unknown[] }> = [];
  function next(key: string) {
    const queue = tableResults.get(key) ?? [];
    return Promise.resolve(queue.shift() ?? { data: null, error: null });
  }
  function clientFor(name: "server" | "admin") {
    return {
      from(table: string) {
        const key = `${name}:${table}`;
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "eq", "neq", "is", "gte", "lt", "limit", "insert", "update", "order"]) {
          chain[method] = (...args: unknown[]) => {
            calls.push({ client: name, table, method, args });
            return chain;
          };
        }
        chain.single = () => next(key);
        chain.maybeSingle = () => next(key);
        chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => next(key).then(resolve, reject);
        return chain;
      },
    };
  }
  return {
    requireChurchSessionMock: vi.fn(),
    sendWithSuppressionMock: vi.fn(),
    tableResults,
    calls,
    clientFor,
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireChurchSession: requireChurchSessionMock }));
vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: vi.fn(async () => clientFor("server")),
  createTenantAdminClient: vi.fn(() => clientFor("admin")),
  queryTenantLocalDb: vi.fn(),
  shouldUseLocalTenantFallback: vi.fn(() => false),
}));
vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/burnout-calculator", () => ({ checkVolunteerBurnout: vi.fn(async () => ({ isBurnedOut: false })) }));
vi.mock("@/lib/communications/send-with-suppression", () => ({ sendWithSuppression: sendWithSuppressionMock }));
vi.mock("@/lib/volunteer-data", () => ({
  getChurchSkillOptions: vi.fn(),
  getServicePlanDetail: vi.fn(),
  getVolunteerPool: vi.fn(),
}));

import { assignVolunteerAction, sendVolunteerReminderAction } from "@/app/app/volunteer-actions";

const SESSION = {
  userId: "login-admin",
  churchProfileId: "profile-admin",
  profile: { id: "login-admin" },
  appContext: { roleId: "church-admin", church: { id: "church-1", name: "Grace Harbor" } },
};
const NOW = new Date("2026-10-01T15:00:00Z");

function queue(key: string, ...results: Array<{ data?: unknown; error?: unknown; count?: number }>) {
  tableResults.set(key, [...(tableResults.get(key) ?? []), ...results]);
}

function shiftRow(overrides: Record<string, unknown> = {}, profile: Record<string, unknown> = {}) {
  return {
    id: "shift-1",
    title: "Greeter",
    starts_at: "2026-11-15T10:00:00+00:00",
    assigned_user_id: "p-maya",
    confirmation_token: null,
    confirmation_token_expires_at: null,
    service_plans: { name: "Sunday Worship", service_date: "2026-11-15", service_time: "10:00:00" },
    profiles: {
      full_name: "Maya Martinez",
      email: "maya@example.org",
      phone: "+15551230000",
      preferred_contact_method: null,
      contact_allowed: true,
      ...profile,
    },
    ...overrides,
  };
}

/** The assignment's reads and write (member client), then the notification's shift read and token write (admin client). */
function queueAssign(row: ReturnType<typeof shiftRow>) {
  queue("server:service_plans", { data: { event_id: "event-1" }, error: null });
  queue("server:service_plan_positions", { data: { id: "pos-g", quantity_needed: 2 }, error: null });
  queue("server:profiles", { data: { id: "p-maya" }, error: null });
  queue("server:volunteer_shifts", { count: 0, error: null }, { data: [], error: null }, { data: { id: "shift-1" }, error: null });
  queue("admin:volunteer_shifts", { data: row, error: null }, { data: [{ id: "shift-1" }], error: null });
}

const ASSIGN = {
  planId: "plan-1",
  positionId: "pos-g",
  profileId: "p-maya",
  roleName: "Greeter",
  startsAt: "2026-11-15T10:00:00",
  endsAt: "2026-11-15T12:00:00",
};

const tokenUpdates = () => calls.filter((c) => c.table === "volunteer_shifts" && c.method === "update");

describe("assignment notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    tableResults.clear();
    calls.length = 0;
    requireChurchSessionMock.mockResolvedValue(SESSION);
    sendWithSuppressionMock.mockResolvedValue({ sent: true, skipped: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("emails the volunteer their own confirm link, valid until the service date + 7 days, naming the church", async () => {
    queueAssign(shiftRow());

    const result = await assignVolunteerAction(ASSIGN);

    expect(result).toMatchObject({ ok: true, notification: { status: "sent", channel: "email" } });
    const [update] = tokenUpdates();
    const { confirmation_token: token, confirmation_token_expires_at: expiresAt } = update.args[0] as Record<string, string>;
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(expiresAt).toBe("2026-11-23T00:00:00.000Z");
    expect(sendWithSuppressionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        session: SESSION,
        recipientProfileId: "p-maya",
        recipientContact: "maya@example.org",
        channel: "email",
        subject: "Grace Harbor: please confirm Greeter on Sunday, November 15",
        body: expect.stringContaining(`/portal/volunteer/confirm/${token}`),
      }),
    );
  });

  it("refuses a shift time that isn't the church's wall-clock time (ADR 0023, Council Review 24)", async () => {
    for (const startsAt of ["2026-11-15T10:00:00Z", "2026-11-15T10:00:00-05:00", "2026-11-15T10:00:00.000Z"]) {
      expect(await assignVolunteerAction({ ...ASSIGN, startsAt })).toMatchObject({
        ok: false,
        error: "Shift times must be the church's local time.",
      });
    }
    expect(calls.some((c) => c.method === "insert")).toBe(false);
  });

  it("reads and writes the confirm token only through the church-scoped admin client (Council Review 23)", async () => {
    queueAssign(shiftRow());
    await assignVolunteerAction(ASSIGN);

    const tokenCalls = calls.filter(
      (c) =>
        c.table === "volunteer_shifts" &&
        ((c.method === "select" && String(c.args[0]).includes("confirmation_token")) || c.method === "update"),
    );
    expect(tokenCalls.length).toBeGreaterThan(0);
    expect(tokenCalls.every((c) => c.client === "admin")).toBe(true);
    expect(calls).toEqual(
      expect.arrayContaining([{ client: "admin", table: "volunteer_shifts", method: "eq", args: ["church_id", "church-1"] }]),
    );
  });

  it("texts a volunteer who prefers SMS and has opted in", async () => {
    queueAssign(shiftRow({}, { preferred_contact_method: "sms" }));
    expect(await assignVolunteerAction(ASSIGN)).toMatchObject({ notification: { status: "sent", channel: "sms" } });
    expect(sendWithSuppressionMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "sms", recipientContact: "+15551230000", body: expect.stringMatching(/^Grace Harbor: /) }),
    );
  });

  it("emails a volunteer who prefers texts but never opted in to them (Council Review 23)", async () => {
    sendWithSuppressionMock
      .mockResolvedValueOnce({ sent: false, skipped: true, skipCode: "opted_out" })
      .mockResolvedValueOnce({ sent: true, skipped: false });
    queueAssign(shiftRow({}, { preferred_contact_method: "sms" }));

    expect(await assignVolunteerAction(ASSIGN)).toMatchObject({
      ok: true,
      notification: { status: "sent", channel: "email", fallback: "they haven't opted in to texts" },
    });
    expect(sendWithSuppressionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ channel: "email", recipientContact: "maya@example.org" }),
    );
  });

  it("doesn't fall back to email when their number is on the do-not-contact list", async () => {
    sendWithSuppressionMock.mockResolvedValueOnce({ sent: false, skipped: true, skipCode: "suppressed" });
    queueAssign(shiftRow({}, { preferred_contact_method: "sms" }));
    expect(await assignVolunteerAction(ASSIGN)).toMatchObject({
      notification: { status: "skipped", reason: "their number is on the do-not-contact list." },
    });
    expect(sendWithSuppressionMock).toHaveBeenCalledTimes(1);
  });

  it("says email isn't set up, instead of claiming it was sent, when no provider is configured", async () => {
    sendWithSuppressionMock.mockResolvedValueOnce({
      sent: false,
      skipped: false,
      error: "Sendgrid isn't configured.",
      errorCode: "provider_not_configured",
    });
    queueAssign(shiftRow());
    expect(await assignVolunteerAction(ASSIGN)).toMatchObject({
      ok: true,
      notification: { status: "failed", reason: "email isn't set up for this church yet." },
    });
  });

  it("skips the send, rather than mail a dead link, when production has no app URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    queueAssign(shiftRow());
    expect(await assignVolunteerAction(ASSIGN)).toMatchObject({
      ok: true,
      notification: { status: "skipped", reason: "the app's web address isn't configured." },
    });
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });

  it("keeps the assignment, and says why, when the volunteer can't be messaged", async () => {
    queueAssign(shiftRow({}, { email: null, phone: null }));
    expect(await assignVolunteerAction(ASSIGN)).toMatchObject({
      ok: true,
      notification: { status: "skipped", reason: "no email or phone on file." },
    });
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });

  it("respects a do-not-contact request and the suppression list", async () => {
    queueAssign(shiftRow({}, { contact_allowed: false }));
    expect(await assignVolunteerAction(ASSIGN)).toMatchObject({
      ok: true,
      notification: { status: "skipped", reason: "they've asked not to be contacted." },
    });

    calls.length = 0;
    tableResults.clear();
    sendWithSuppressionMock.mockResolvedValueOnce({ sent: false, skipped: true, skipCode: "suppressed" });
    queueAssign(shiftRow());
    expect(await assignVolunteerAction(ASSIGN)).toMatchObject({
      ok: true,
      notification: { status: "skipped", reason: "their address is on the do-not-contact list." },
    });
  });

  it("never undoes the assignment when sending throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sendWithSuppressionMock.mockRejectedValueOnce(new Error("provider down"));
    queueAssign(shiftRow());
    expect(await assignVolunteerAction(ASSIGN)).toMatchObject({
      ok: true,
      notification: { status: "failed", reason: "the message couldn't be sent." },
    });
    errorSpy.mockRestore();
  });

  it("keeps an existing link that's still valid long enough, and only extends one that isn't", async () => {
    queueAssign(shiftRow({ confirmation_token: "existing", confirmation_token_expires_at: "2026-12-31T00:00:00Z" }));
    await assignVolunteerAction(ASSIGN);
    expect(tokenUpdates()).toHaveLength(0);
    expect(sendWithSuppressionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: expect.stringContaining("/portal/volunteer/confirm/existing") }),
    );

    calls.length = 0;
    tableResults.clear();
    queueAssign(shiftRow({ confirmation_token: "existing", confirmation_token_expires_at: "2026-10-10T00:00:00Z" }));
    await assignVolunteerAction(ASSIGN);
    expect(tokenUpdates()[0].args[0]).toEqual({
      confirmation_token: "existing",
      confirmation_token_expires_at: "2026-11-23T00:00:00.000Z",
    });
  });

  describe("Remind", () => {
    function queueReminder(row: ReturnType<typeof shiftRow>, reminderInsert: { data?: unknown; error?: unknown } = {
      data: { sent_at: "2026-10-01T15:00:00Z" },
      error: null,
    }) {
      queue("server:volunteer_shifts", { data: { assigned_user_id: "p-maya", confirmation_status: "pending" }, error: null });
      queue("admin:volunteer_shifts", { data: row, error: null }, { data: [{ id: "shift-1" }], error: null });
      queue("server:volunteer_shift_reminders", reminderInsert);
    }

    it("sends the reminder, with the scheduler's note, and records it as sent by the admin's church profile", async () => {
      queueReminder(shiftRow());

      const result = await sendVolunteerReminderAction({ planId: "plan-1", shiftId: "shift-1", note: "Please arrive early." });

      expect(result).toEqual({ ok: true, sentAt: "2026-10-01T15:00:00Z", notification: { status: "sent", channel: "email" } });
      expect(sendWithSuppressionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Grace Harbor: reminder to confirm Greeter on Sunday, November 15",
          body: expect.stringContaining("A note from your team: Please arrive early."),
        }),
      );
      const insert = calls.find((c) => c.table === "volunteer_shift_reminders" && c.method === "insert");
      expect(insert?.args[0]).toMatchObject({
        reminder_channel: "email",
        reminder_note: "Please arrive early.\n\nSent by email.",
        // The church profile id, never the login id (S7).
        sent_by: "profile-admin",
      });
    });

    it("records nothing, and says so, when the reminder couldn't be sent (Council Review 23)", async () => {
      queueReminder(shiftRow({}, { email: null, phone: null }));
      const result = await sendVolunteerReminderAction({ planId: "plan-1", shiftId: "shift-1" });
      expect(result).toEqual({
        ok: false,
        error: "Reminder not sent: no email or phone on file.",
        notification: { status: "skipped", reason: "no email or phone on file." },
      });
      expect(calls.some((c) => c.table === "volunteer_shift_reminders" && c.method === "insert")).toBe(false);
    });

    it("reports success with a warning, never a failure, when a sent reminder can't be recorded (no double send)", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      queueReminder(shiftRow(), { data: null, error: { message: "insert failed" } });

      const result = await sendVolunteerReminderAction({ planId: "plan-1", shiftId: "shift-1" });

      expect(result).toMatchObject({
        ok: true,
        warning: "The reminder was sent, but couldn't be recorded on the roster.",
        notification: { status: "sent", channel: "email" },
      });
      errorSpy.mockRestore();
    });
  });
});
