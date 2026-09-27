import { beforeEach, describe, expect, it, vi } from "vitest";

// Sibling test file for G1.4 (blockout dates): the self, emailed-link and
// admin actions in app/app/volunteer-actions.ts. Date rules themselves are
// covered in lib/blockout-dates.test.ts; these cover identity, church
// scoping, token validity and the "already scheduled" hint.

const {
  revalidatePathMock,
  requireChurchSessionMock,
  serverClientMock,
  adminClientMock,
  tableResults,
  calls,
} = vi.hoisted(() => {
  const tableResults = new Map<string, Array<{ data?: unknown; error?: unknown }>>();
  const calls: Array<{ client: string; table: string; method: string; args: unknown[] }> = [];
  function next(table: string) {
    const queue = tableResults.get(table) ?? [];
    return Promise.resolve(queue.shift() ?? { data: null, error: null });
  }
  function builder(client: string, table: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "is", "in", "gte", "lt", "order", "limit", "insert", "upsert", "update", "delete"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ client, table, method, args });
        return chain;
      };
    }
    chain.single = () => next(table);
    chain.maybeSingle = () => next(table);
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => next(table).then(resolve, reject);
    return chain;
  }
  return {
    revalidatePathMock: vi.fn(),
    requireChurchSessionMock: vi.fn(),
    serverClientMock: vi.fn(async () => ({ from: (table: string) => builder("server", table) })),
    adminClientMock: vi.fn(() => ({ from: (table: string) => builder("admin", table) })),
    tableResults,
    calls,
  };
});

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/auth", () => ({ requireChurchSession: requireChurchSessionMock }));
vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: serverClientMock,
  createTenantAdminClient: adminClientMock,
  queryTenantLocalDb: vi.fn(),
  shouldUseLocalTenantFallback: vi.fn(() => false),
}));
vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/volunteer-data", () => ({
  getChurchSkillOptions: vi.fn(),
  getServicePlanDetail: vi.fn(),
  getVolunteerPool: vi.fn(),
}));

import {
  addBlockoutDatesByTokenAction,
  addMyBlockoutDatesAction,
  addVolunteerBlockoutDatesAction,
  listBlockoutDatesByTokenAction,
  listMyBlockoutDatesAction,
  listVolunteerBlockoutDatesAction,
  removeBlockoutDateByTokenAction,
  removeMyBlockoutDateAction,
  removeVolunteerBlockoutDateAction,
} from "@/app/app/volunteer-actions";

const TODAY = "2026-10-01";
const FUTURE = "2026-10-11";

function sessionFor(roleId: string) {
  return { appContext: { roleId, church: { id: "church-1" } }, profile: { id: "me" } };
}

function queue(table: string, ...results: Array<{ data?: unknown; error?: unknown }>) {
  tableResults.set(table, [...(tableResults.get(table) ?? []), ...results]);
}

const upserts = () => calls.filter((c) => c.method === "upsert");
const deletes = () => calls.filter((c) => c.method === "delete");

describe("blockout date actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
    tableResults.clear();
    calls.length = 0;
    requireChurchSessionMock.mockResolvedValue(sessionFor("member"));
  });

  describe("self (signed in)", () => {
    it("adds a range for the signed-in person only, through the RLS-bound server client", async () => {
      queue("volunteer_blocked_dates", { error: null }, { data: [{ blocked_date: FUTURE, reason: "Trip" }], error: null });
      queue("volunteer_shifts", { data: [], error: null });

      const result = await addMyBlockoutDatesAction({ from: FUTURE, to: "2026-10-12", reason: "Trip" });

      expect(result).toEqual({ ok: true, dates: [{ date: FUTURE, reason: "Trip" }], scheduledOn: [] });
      expect(upserts()).toHaveLength(1);
      expect(upserts()[0]).toMatchObject({ client: "server" });
      expect(upserts()[0].args).toEqual([
        [
          { church_id: "church-1", profile_id: "me", blocked_date: "2026-10-11", reason: "Trip" },
          { church_id: "church-1", profile_id: "me", blocked_date: "2026-10-12", reason: "Trip" },
        ],
        { onConflict: "profile_id,blocked_date", ignoreDuplicates: true },
      ]);
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/member/schedule");
    });

    it("tells the volunteer when they're already scheduled on a day they block", async () => {
      queue("volunteer_blocked_dates", { error: null }, { data: [], error: null });
      queue("volunteer_shifts", { data: [{ starts_at: "2026-10-11T10:00:00+00:00" }], error: null });

      const result = await addMyBlockoutDatesAction({ from: FUTURE, to: "2026-10-13" });

      expect(result).toMatchObject({ ok: true, scheduledOn: ["2026-10-11"] });
      expect(calls).toEqual(
        expect.arrayContaining([
          { client: "server", table: "volunteer_shifts", method: "neq", args: ["confirmation_status", "declined"] },
          { client: "server", table: "volunteer_shifts", method: "eq", args: ["assigned_user_id", "me"] },
        ]),
      );
    });

    it("rejects invalid ranges without writing", async () => {
      expect(await addMyBlockoutDatesAction({ from: "2026-09-01" })).toEqual({
        ok: false,
        error: "You can't mark a date in the past.",
      });
      expect(upserts()).toHaveLength(0);
    });

    it("removes one of the signed-in person's own days, and refuses past days", async () => {
      queue("volunteer_blocked_dates", { error: null }, { data: [], error: null });
      expect(await removeMyBlockoutDateAction({ date: FUTURE })).toEqual({ ok: true, dates: [], scheduledOn: [] });
      expect(calls).toEqual(
        expect.arrayContaining([
          { client: "server", table: "volunteer_blocked_dates", method: "eq", args: ["profile_id", "me"] },
          { client: "server", table: "volunteer_blocked_dates", method: "eq", args: ["blocked_date", FUTURE] },
        ]),
      );

      calls.length = 0;
      expect(await removeMyBlockoutDateAction({ date: "2026-09-01" })).toMatchObject({ ok: false });
      expect(deletes()).toHaveLength(0);
    });

    it("lists upcoming days only", async () => {
      queue("volunteer_blocked_dates", { data: [{ blocked_date: FUTURE, reason: null }], error: null });
      expect(await listMyBlockoutDatesAction()).toEqual([{ date: FUTURE, reason: null }]);
      expect(calls).toEqual(
        expect.arrayContaining([{ client: "server", table: "volunteer_blocked_dates", method: "gte", args: ["blocked_date", TODAY] }]),
      );
    });
  });

  describe("emailed schedule link (token)", () => {
    const validShift = {
      id: "shift-1",
      church_id: "church-7",
      assigned_user_id: "vol-9",
      confirmation_token_expires_at: "2026-10-20T00:00:00Z",
    };

    it("acts as the token's volunteer and church, never a caller-supplied id", async () => {
      queue("volunteer_shifts", { data: validShift, error: null }, { data: [], error: null });
      queue("volunteer_blocked_dates", { error: null }, { data: [{ blocked_date: FUTURE, reason: null }], error: null });

      const result = await addBlockoutDatesByTokenAction({ token: "tok", from: FUTURE });

      expect(result).toMatchObject({ ok: true, dates: [{ date: FUTURE, reason: null }] });
      expect(upserts()[0]).toMatchObject({ client: "admin" });
      expect((upserts()[0].args[0] as Array<Record<string, string>>)[0]).toMatchObject({
        church_id: "church-7",
        profile_id: "vol-9",
      });
    });

    it("refuses an expired or unknown link without writing", async () => {
      queue("volunteer_shifts", { data: { ...validShift, confirmation_token_expires_at: "2026-09-30T00:00:00Z" }, error: null });
      expect(await addBlockoutDatesByTokenAction({ token: "old", from: FUTURE })).toEqual({
        ok: false,
        error: "This link is invalid or has expired.",
      });

      queue("volunteer_shifts", { data: null, error: null });
      expect(await removeBlockoutDateByTokenAction({ token: "nope", date: FUTURE })).toEqual({
        ok: false,
        error: "This link is invalid or has expired.",
      });

      queue("volunteer_shifts", { data: null, error: null });
      expect(await listBlockoutDatesByTokenAction("nope")).toBeNull();

      expect(upserts()).toHaveLength(0);
      expect(deletes()).toHaveLength(0);
    });

    it("removes and lists the token volunteer's days", async () => {
      queue("volunteer_shifts", { data: validShift, error: null });
      queue("volunteer_blocked_dates", { error: null }, { data: [], error: null });
      expect(await removeBlockoutDateByTokenAction({ token: "tok", date: FUTURE })).toMatchObject({ ok: true });
      expect(deletes()[0]).toMatchObject({ client: "admin" });
      expect(calls).toEqual(
        expect.arrayContaining([{ client: "admin", table: "volunteer_blocked_dates", method: "eq", args: ["profile_id", "vol-9"] }]),
      );

      queue("volunteer_shifts", { data: validShift, error: null });
      queue("volunteer_blocked_dates", { data: [{ blocked_date: FUTURE, reason: "Away" }], error: null });
      expect(await listBlockoutDatesByTokenAction("tok")).toEqual([{ date: FUTURE, reason: "Away" }]);
    });
  });

  describe("admin (service-plan write access)", () => {
    beforeEach(() => {
      requireChurchSessionMock.mockResolvedValue(sessionFor("church-admin"));
    });

    it("rejects members and volunteers", async () => {
      for (const roleId of ["member", "volunteer"]) {
        requireChurchSessionMock.mockResolvedValue(sessionFor(roleId));
        await expect(listVolunteerBlockoutDatesAction({ profileId: "p-1" })).rejects.toThrow("Unauthorized");
        await expect(addVolunteerBlockoutDatesAction({ profileId: "p-1", from: FUTURE })).rejects.toThrow("Unauthorized");
        await expect(removeVolunteerBlockoutDateAction({ profileId: "p-1", date: FUTURE })).rejects.toThrow("Unauthorized");
      }
    });

    it("refuses a volunteer outside the admin's church", async () => {
      queue("profiles", { data: null, error: null });
      expect(await addVolunteerBlockoutDatesAction({ profileId: "other", from: FUTURE })).toEqual({
        ok: false,
        error: "Volunteer not found.",
      });
      expect(upserts()).toHaveLength(0);
      expect(calls).toEqual(expect.arrayContaining([{ client: "server", table: "profiles", method: "eq", args: ["church_id", "church-1"] }]));
    });

    it("adds, lists and removes for a volunteer in the church", async () => {
      queue("profiles", { data: { id: "p-1" }, error: null }, { data: { id: "p-1" }, error: null }, { data: { id: "p-1" }, error: null });
      queue("volunteer_blocked_dates", { error: null }, { data: [{ blocked_date: FUTURE, reason: null }], error: null });
      queue("volunteer_shifts", { data: [{ starts_at: `${FUTURE}T10:00:00+00:00` }], error: null });

      expect(await addVolunteerBlockoutDatesAction({ profileId: "p-1", from: FUTURE })).toEqual({
        ok: true,
        dates: [{ date: FUTURE, reason: null }],
        scheduledOn: [FUTURE],
      });

      queue("volunteer_blocked_dates", { data: [{ blocked_date: FUTURE, reason: null }], error: null });
      expect(await listVolunteerBlockoutDatesAction({ profileId: "p-1" })).toEqual({
        ok: true,
        dates: [{ date: FUTURE, reason: null }],
      });

      queue("volunteer_blocked_dates", { error: null }, { data: [], error: null });
      expect(await removeVolunteerBlockoutDateAction({ profileId: "p-1", date: FUTURE })).toMatchObject({ ok: true, dates: [] });
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/volunteers");
    });
  });
});
