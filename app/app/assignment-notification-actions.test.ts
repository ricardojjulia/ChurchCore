import { beforeEach, describe, expect, it, vi } from "vitest";

// Sibling test file for G1.5 (assignment notifications): assignVolunteerAction
// and sendVolunteerReminderAction now create the shift's own confirm link and
// message the volunteer through sendWithSuppression. Message wording and
// channel rules are covered in lib/volunteer-notifications.test.ts.

const { requireChurchSessionMock, sendWithSuppressionMock, tableResults, calls, serverClient } = vi.hoisted(() => {
  const tableResults = new Map<string, Array<{ data?: unknown; error?: unknown; count?: number }>>();
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  function next(table: string) {
    const queue = tableResults.get(table) ?? [];
    return Promise.resolve(queue.shift() ?? { data: null, error: null });
  }
  function builder(table: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "is", "gte", "lt", "limit", "insert", "update", "order"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      };
    }
    chain.single = () => next(table);
    chain.maybeSingle = () => next(table);
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => next(table).then(resolve, reject);
    return chain;
  }
  return {
    requireChurchSessionMock: vi.fn(),
    sendWithSuppressionMock: vi.fn(),
    tableResults,
    calls,
    serverClient: { from: (table: string) => builder(table) },
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireChurchSession: requireChurchSessionMock }));
vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: vi.fn(async () => serverClient),
  createTenantAdminClient: vi.fn(),
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

const SESSION = { appContext: { roleId: "church-admin", church: { id: "church-1" } }, profile: { id: "admin-1" } };
const NOW = new Date("2026-10-01T15:00:00Z");

function queue(table: string, ...results: Array<{ data?: unknown; error?: unknown; count?: number }>) {
  tableResults.set(table, [...(tableResults.get(table) ?? []), ...results]);
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

/** Queues a successful assignment's reads and write, then the notification's shift read. */
function queueAssign(row: ReturnType<typeof shiftRow>) {
  queue("service_plans", { data: { event_id: "event-1" }, error: null });
  queue("service_plan_positions", { data: { id: "pos-g", quantity_needed: 2 }, error: null });
  queue("profiles", { data: { id: "p-maya" }, error: null });
  queue("volunteer_shifts", { count: 0, error: null }, { data: [], error: null }, { data: { id: "shift-1" }, error: null }, { data: row, error: null }, { error: null });
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

  it("emails the volunteer their own confirm link, valid until the service date + 7 days", async () => {
    queueAssign(shiftRow());

    const result = await assignVolunteerAction(ASSIGN);

    expect(result).toEqual({ ok: true, notification: { status: "sent", channel: "email" } });
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
        subject: "Please confirm: Greeter on Sunday, November 15",
        body: expect.stringContaining(`/portal/volunteer/confirm/${token}`),
      }),
    );
  });

  it("texts a volunteer who prefers SMS", async () => {
    queueAssign(shiftRow({}, { preferred_contact_method: "sms" }));
    expect(await assignVolunteerAction(ASSIGN)).toMatchObject({ notification: { status: "sent", channel: "sms" } });
    expect(sendWithSuppressionMock).toHaveBeenCalledWith(expect.objectContaining({ channel: "sms", recipientContact: "+15551230000" }));
  });

  it("keeps the assignment, and says why, when the volunteer can't be messaged", async () => {
    queueAssign(shiftRow({}, { email: null, phone: null }));
    expect(await assignVolunteerAction(ASSIGN)).toEqual({
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
    expect(await assignVolunteerAction(ASSIGN)).toEqual({
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
    function queueReminder(row: ReturnType<typeof shiftRow>) {
      queue(
        "volunteer_shifts",
        { data: { assigned_user_id: "p-maya", confirmation_status: "pending", confirmation_token: null, confirmation_token_expires_at: null }, error: null },
        { data: row, error: null },
        { error: null },
      );
      queue("volunteer_shift_reminders", { data: { sent_at: "2026-10-01T15:00:00Z" }, error: null });
    }

    it("actually sends the reminder, with the scheduler's note, and records the channel used", async () => {
      queueReminder(shiftRow());

      const result = await sendVolunteerReminderAction({ planId: "plan-1", shiftId: "shift-1", note: "Please arrive early." });

      expect(result).toEqual({ ok: true, sentAt: "2026-10-01T15:00:00Z", notification: { status: "sent", channel: "email" } });
      expect(sendWithSuppressionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Reminder: please confirm Greeter on Sunday, November 15",
          body: expect.stringContaining("A note from your team: Please arrive early."),
        }),
      );
      const insert = calls.find((c) => c.table === "volunteer_shift_reminders" && c.method === "insert");
      expect(insert?.args[0]).toMatchObject({ reminder_channel: "email", reminder_note: "Please arrive early.\n\nSent by email." });
    });

    it("records the reminder as manual, with the reason, when nothing could be sent", async () => {
      queueReminder(shiftRow({}, { email: null, phone: null }));
      const result = await sendVolunteerReminderAction({ planId: "plan-1", shiftId: "shift-1" });
      expect(result).toMatchObject({ ok: true, notification: { status: "skipped" } });
      const insert = calls.find((c) => c.table === "volunteer_shift_reminders" && c.method === "insert");
      expect(insert?.args[0]).toMatchObject({ reminder_channel: "manual", reminder_note: "Not sent: no email or phone on file." });
    });
  });
});
