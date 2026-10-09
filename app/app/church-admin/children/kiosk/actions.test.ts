import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase } from "@/tests/fixtures/fake-supabase";

const mocks = vi.hoisted(() => ({
  requireChurchSession: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  cookieSet: vi.fn(),
  admin: { current: null as unknown },
  logAuditEvent: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireChurchSession: mocks.requireChurchSession }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.cookieSet, get: () => undefined, delete: vi.fn() }),
}));
vi.mock("@/lib/supabase/tenant", () => ({ createTenantAdminClient: () => mocks.admin.current }));
vi.mock("@/lib/supabase/config", () => ({ hasTenantSupabaseEnv: () => false, hasControlPlaneSupabaseEnv: () => false }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: mocks.logAuditEvent }));

import { startKioskAction } from "@/app/app/church-admin/children/kiosk/actions";

const LOGIN_ID = "login-id-1";

function session(roleId: string) {
  return {
    userId: LOGIN_ID,
    churchProfileId: "church-profile-1",
    appContext: { kind: "church", roleId, church: { id: "church-1", timezone: "UTC" } },
  };
}

let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakeSupabase({ tables: { ccm_kiosk_sessions: [] } });
  mocks.admin.current = fake.client;
  mocks.requireChurchSession.mockResolvedValue(session("church-admin"));
  mocks.logAuditEvent.mockResolvedValue(undefined);
});

function form(note?: string, pin = "123456", confirm = pin) {
  const data = new FormData();
  data.set("exitPin", pin);
  data.set("exitPinConfirm", confirm);
  if (note !== undefined) data.set("deviceNote", note);
  return data;
}

describe("startKioskAction", () => {
  it.each(["member", "pastor", "secretary", "ministry-leader"])(
    "refuses %s before writing or auditing anything",
    async (role) => {
      mocks.requireChurchSession.mockResolvedValue(session(role));
      await expect(startKioskAction(form())).rejects.toThrow("Unauthorized");
      expect(fake.tables.ccm_kiosk_sessions).toHaveLength(0);
      expect(mocks.logAuditEvent).not.toHaveBeenCalled();
      expect(mocks.cookieSet).not.toHaveBeenCalled();
    },
  );

  it("starts a kiosk for a church admin: row, audit, cookie, redirect", async () => {
    await expect(startKioskAction(form("  Lobby iPad  "))).rejects.toThrow("NEXT_REDIRECT:/kiosk/children");

    expect(fake.tables.ccm_kiosk_sessions).toHaveLength(1);
    const row = fake.tables.ccm_kiosk_sessions[0];
    // The login id, not the church profile id, goes in the login-id column.
    expect(row).toMatchObject({ church_id: "church-1", admin_login_id: LOGIN_ID, device_note: "Lobby iPad" });

    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: "ccm_kiosk_sessions",
        recordId: row.id,
        operation: "INSERT",
        actorId: LOGIN_ID,
        churchId: "church-1",
        actorRole: "church-admin",
        newValues: expect.objectContaining({ event: "kiosk.start", deviceNote: "Lobby iPad" }),
      }),
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "cc_kiosk",
      row.id,
      expect.objectContaining({ httpOnly: true, sameSite: "strict", path: "/" }),
    );
  });

  it("stores only a bcrypt hash of the exit PIN, never the PIN", async () => {
    await expect(startKioskAction(form("Lobby", "482916"))).rejects.toThrow("NEXT_REDIRECT");
    const hash = fake.tables.ccm_kiosk_sessions[0].exit_pin_hash as string;
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare("482916", hash)).toBe(true);
    expect(JSON.stringify(mocks.logAuditEvent.mock.calls)).not.toContain("482916");
    expect(JSON.stringify(fake.tables.ccm_kiosk_sessions)).not.toContain("482916");
  });

  it.each([["12345"], ["1234567"], ["abcdef"], ["12 456"], [""]])(
    "refuses an invalid PIN %j without writing, auditing or setting a cookie",
    async (pin) => {
      expect(await startKioskAction(form("x", pin))).toEqual({ status: "invalid_pin" });
      expect(fake.tables.ccm_kiosk_sessions).toHaveLength(0);
      expect(mocks.logAuditEvent).not.toHaveBeenCalled();
      expect(mocks.cookieSet).not.toHaveBeenCalled();
    },
  );

  it("refuses a PIN whose confirmation differs, and works through useActionState", async () => {
    expect(await startKioskAction(null, form("x", "123456", "123457"))).toEqual({ status: "pin_mismatch" });
    expect(fake.tables.ccm_kiosk_sessions).toHaveLength(0);
    await expect(startKioskAction({ status: "pin_mismatch" }, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(fake.tables.ccm_kiosk_sessions).toHaveLength(1);
  });

  it("caps the device note and accepts none", async () => {
    await expect(startKioskAction(form("x".repeat(200)))).rejects.toThrow("NEXT_REDIRECT");
    expect((fake.tables.ccm_kiosk_sessions[0].device_note as string).length).toBe(80);
    await expect(startKioskAction(form())).rejects.toThrow("NEXT_REDIRECT");
    expect(fake.tables.ccm_kiosk_sessions[1].device_note).toBeNull();
    // and no form at all means no PIN, so nothing starts
    expect(await startKioskAction()).toEqual({ status: "invalid_pin" });
  });

  it("does not leave an active kiosk behind when the audit write fails", async () => {
    mocks.logAuditEvent.mockRejectedValue(new Error("audit down"));
    await expect(startKioskAction(form())).rejects.toThrow("Kiosk mode could not be started.");
    expect(fake.tables.ccm_kiosk_sessions[0].ended_at).toBeTruthy();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("fails without a cookie when the session row cannot be written", async () => {
    fake = createFakeSupabase({ tableError: () => ({ message: "db down" }) });
    mocks.admin.current = fake.client;
    await expect(startKioskAction(form())).rejects.toThrow("Kiosk mode could not be started.");
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });
});
