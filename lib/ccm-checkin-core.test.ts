import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase } from "@/tests/fixtures/fake-supabase";

const mocks = vi.hoisted(() => ({ admin: { current: null as unknown } }));
vi.mock("@/lib/supabase/tenant", () => ({ createTenantAdminClient: () => mocks.admin.current }));

import { evaluateServiceGate, performCheckin } from "@/lib/ccm-checkin-core";

const CHURCH = "c1";
const ADMIN = "admin-login";
const SERVICE = "s1";
const ROOM = "r1";
const CHILD = "child-1";

function setup(opts: {
  service?: Record<string, unknown>;
  rooms?: Array<Record<string, unknown>>;
  insertError?: { code?: string; message: string };
  rpcPin?: string | null;
} = {}) {
  const fake = createFakeSupabase({
    tables: {
      ccm_services: [
        {
          id: SERVICE,
          church_id: CHURCH,
          ministry_id: "m1",
          status: "open",
          checkin_session_status: "enabled",
          checkin_session_starts_at: null,
          checkin_session_ends_at: null,
          ...opts.service,
        },
      ],
      children_rooms: opts.rooms ?? [
        { id: ROOM, church_id: CHURCH, ministry_id: "m1", name: "Nursery", is_active: true },
        { id: "r-other-min", church_id: CHURCH, ministry_id: "m2", name: "Youth", is_active: true },
        { id: "r-inactive", church_id: CHURCH, ministry_id: "m1", name: "Closed", is_active: false },
        { id: "r-other-church", church_id: "c2", ministry_id: "m1", name: "Foreign", is_active: true },
      ],
      profiles: [
        { id: CHILD, church_id: CHURCH, full_name: "Ana Rivera" },
        { id: "foreign-child", church_id: "c2", full_name: "Not Ours" },
        { id: "merged-child", church_id: CHURCH, full_name: "Merged", merged_at: "2026-01-01" },
      ],
      ccm_checkin_sessions: [],
    },
    insertError: opts.insertError ? () => opts.insertError! : undefined,
    rpc: { generate_checkin_pin: () => ({ data: opts.rpcPin === undefined ? "ACEFGH" : opts.rpcPin, error: null }) },
  });
  mocks.admin.current = fake.client;
  return fake;
}

const base = { churchId: CHURCH, actorLoginId: ADMIN, serviceId: SERVICE, roomId: ROOM };

beforeEach(() => vi.clearAllMocks());

describe("evaluateServiceGate", () => {
  const open = { status: "open", checkin_session_status: "enabled", checkin_session_starts_at: null, checkin_session_ends_at: null };
  it("is open for an open, enabled service with no window", () => {
    expect(evaluateServiceGate(open)).toBeNull();
  });
  it("names each closed reason", () => {
    expect(evaluateServiceGate({ ...open, status: "closed" })).toBe("not_open");
    expect(evaluateServiceGate({ ...open, checkin_session_status: "paused" })).toBe("not_enabled");
    const window = { checkin_session_starts_at: "2026-10-08T10:00:00Z", checkin_session_ends_at: "2026-10-08T12:00:00Z" };
    expect(evaluateServiceGate({ ...open, ...window }, Date.parse("2026-10-08T09:00:00Z"))).toBe("not_started");
    expect(evaluateServiceGate({ ...open, ...window }, Date.parse("2026-10-08T13:00:00Z"))).toBe("ended");
    expect(evaluateServiceGate({ ...open, ...window }, Date.parse("2026-10-08T11:00:00Z"))).toBeNull();
  });
});

describe("performCheckin", () => {
  it("checks a child in: bcrypt-hashed PIN, actor, source, name from the database", async () => {
    const fake = setup();
    const result = await performCheckin({ ...base, childProfileId: CHILD, childName: "Forged Name", source: "kiosk" });

    expect(result.status).toBe("checked_in");
    if (result.status !== "checked_in") return;
    expect(result.pin).toBe("ACEFGH");
    expect(result.session.roomName).toBe("Nursery");
    expect(result.session.childName).toBe("Ana Rivera");

    const row = fake.tables.ccm_checkin_sessions[0];
    expect(row).toMatchObject({
      church_id: CHURCH,
      service_id: SERVICE,
      room_id: ROOM,
      child_profile_id: CHILD,
      child_name: "Ana Rivera",
      checked_in_by: ADMIN,
      checkin_source: "kiosk",
    });
    expect(row.pin_hash).not.toBe("ACEFGH");
    expect(await bcrypt.compare("ACEFGH", row.pin_hash as string)).toBe(true);
    expect(JSON.stringify(fake.calls)).not.toContain("ACEFGH");
  });

  it("writes an explicit audit event with the login id, and no PIN or names (R5)", async () => {
    const fake = setup();
    fake.tables.audit_log = [];
    for (const source of ["staff", "kiosk"] as const) {
      await performCheckin({ ...base, childProfileId: source === "kiosk" ? CHILD : undefined, childName: "Ana Rivera", source });
    }
    const audits = fake.tables.audit_log;
    expect(audits).toHaveLength(2);
    expect(audits[0]).toMatchObject({
      table_name: "ccm_checkin_sessions",
      operation: "INSERT",
      actor_id: ADMIN,
      church_id: CHURCH,
      new_values: { event: "checkin", source: "staff", serviceId: SERVICE, roomId: ROOM },
    });
    expect(audits[1]).toMatchObject({ new_values: { source: "kiosk" } });
    expect(audits[0].record_id).toBe(fake.tables.ccm_checkin_sessions[0].id);
    expect(JSON.stringify(audits)).not.toMatch(/ACEFGH|Ana|Rivera/);
  });

  it("does not audit a refused or duplicate check-in", async () => {
    const fake = setup({ insertError: { code: "23505", message: "dup" } });
    fake.tables.audit_log = [];
    await performCheckin({ ...base, childProfileId: CHILD, source: "kiosk" });
    await performCheckin({ ...base, roomId: "nope", childProfileId: CHILD, source: "kiosk" });
    expect(fake.tables.audit_log).toHaveLength(0);
  });

  it("still returns the PIN when the audit write fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = setup();
    const original = fake.client.from;
    mocks.admin.current = {
      ...fake.client,
      from: (t: string) => (t === "audit_log" ? { insert: async () => ({ error: { message: "down" } }) } : original(t)),
    };
    const result = await performCheckin({ ...base, childProfileId: CHILD, source: "kiosk" });
    expect(result.status).toBe("checked_in");
    expect(error).toHaveBeenCalledWith("check-in audit write failed");
    error.mockRestore();
  });

  it("keeps the staff-typed name for a staff walk-in without a profile", async () => {
    const fake = setup();
    const result = await performCheckin({ ...base, childName: "Visitor Kid", guardianName: "Mom", source: "staff" });
    expect(result.status).toBe("checked_in");
    expect(fake.tables.ccm_checkin_sessions[0]).toMatchObject({
      child_name: "Visitor Kid",
      guardian_name: "Mom",
      checkin_source: "staff",
      child_profile_id: null,
    });
  });

  it("falls back to a CSPRNG PIN over the same alphabet when the RPC fails", async () => {
    setup({ rpcPin: null });
    const result = await performCheckin({ ...base, childProfileId: CHILD, source: "kiosk" });
    if (result.status !== "checked_in") throw new Error("expected checked in");
    expect(result.pin).toMatch(/^[ACEFGHJKLMNPQRTUVWXY3479]{6}$/);
  });

  it.each([
    [{ status: "closed" }, "not_open"],
    [{ checkin_session_status: "paused" }, "not_enabled"],
    [{ checkin_session_starts_at: "2999-01-01T00:00:00Z", checkin_session_ends_at: "2999-01-02T00:00:00Z" }, "not_started"],
    [{ checkin_session_starts_at: "2000-01-01T00:00:00Z", checkin_session_ends_at: "2000-01-02T00:00:00Z" }, "ended"],
  ])("records nothing when the service gate is closed (%j)", async (service, reason) => {
    const fake = setup({ service });
    expect(await performCheckin({ ...base, childProfileId: CHILD, source: "kiosk" })).toEqual({ status: "closed", reason });
    expect(fake.tables.ccm_checkin_sessions).toHaveLength(0);
  });

  it("treats a service of another church as closed", async () => {
    const fake = setup();
    expect(await performCheckin({ ...base, churchId: "c2", childProfileId: CHILD, source: "kiosk" })).toMatchObject({ status: "closed" });
    expect(fake.tables.ccm_checkin_sessions).toHaveLength(0);
  });

  it.each(["r-other-min", "r-inactive", "r-other-church", "no-such-room"])(
    "refuses room %s",
    async (roomId) => {
      const fake = setup();
      expect(await performCheckin({ ...base, roomId, childProfileId: CHILD, source: "kiosk" })).toEqual({ status: "invalid_room" });
      expect(fake.tables.ccm_checkin_sessions).toHaveLength(0);
    },
  );

  it.each(["foreign-child", "merged-child", "missing-child"])("refuses child %s", async (childProfileId) => {
    const fake = setup();
    expect(await performCheckin({ ...base, childProfileId, source: "kiosk" })).toEqual({ status: "invalid_child" });
    expect(fake.tables.ccm_checkin_sessions).toHaveLength(0);
  });

  it("reports 'already' on the unique-index violation and issues no PIN", async () => {
    setup({ insertError: { code: "23505", message: "duplicate key" } });
    expect(await performCheckin({ ...base, childProfileId: CHILD, source: "kiosk" })).toEqual({ status: "already" });
  });

  it("throws a safe message, not the database error, on any other failure", async () => {
    setup({ insertError: { code: "42501", message: "permission denied for table secret_thing" } });
    await expect(performCheckin({ ...base, childProfileId: CHILD, source: "kiosk" })).rejects.toThrow(
      "Check-in could not be recorded.",
    );
  });
});
