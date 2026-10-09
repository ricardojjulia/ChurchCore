import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase } from "@/tests/fixtures/fake-supabase";

const mocks = vi.hoisted(() => ({
  requireChurchSession: vi.fn(),
  admin: { current: null as unknown },
  logAuditEvent: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireChurchSession: mocks.requireChurchSession }));
vi.mock("@/lib/supabase/tenant", () => ({ createTenantAdminClient: () => mocks.admin.current }));
vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: mocks.logAuditEvent }));

import {
  getMyFamilyCheckinCodeAction,
  regenerateFamilyCheckinCodeAction,
} from "@/app/app/family-checkin-code-actions";

const FAMILY = "00000000-0000-4000-8000-0000000000f1";
const OTHER_FAMILY = "00000000-0000-4000-8000-0000000000f2";
const FOREIGN_FAMILY = "00000000-0000-4000-8000-0000000000f3";

function session(roleId: string, churchProfileId: string | null = "me") {
  return {
    userId: "login-1",
    churchProfileId,
    appContext: { kind: "church", roleId, church: { id: "church-1", timezone: "UTC" } },
  };
}

let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakeSupabase({
    tables: {
      profiles: [
        { id: "me", church_id: "church-1", family_id: FAMILY },
        { id: "loner", church_id: "church-1", family_id: null },
      ],
      families: [
        { id: FAMILY, church_id: "church-1", checkin_code: null },
        { id: OTHER_FAMILY, church_id: "church-1", checkin_code: "KEEPME22" },
        { id: FOREIGN_FAMILY, church_id: "church-2", checkin_code: "FOREIGN2" },
      ],
    },
  });
  mocks.admin.current = fake.client;
  mocks.requireChurchSession.mockResolvedValue(session("member"));
  mocks.logAuditEvent.mockResolvedValue(undefined);
});

describe("getMyFamilyCheckinCodeAction", () => {
  it("generates the code on first view and returns the same one afterwards", async () => {
    const first = await getMyFamilyCheckinCodeAction();
    expect(first.status).toBe("ok");
    const second = await getMyFamilyCheckinCodeAction();
    expect(second).toEqual(first);
    expect(fake.tables.families[0].checkin_code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it("returns only the caller's own family, never another family's code", async () => {
    await getMyFamilyCheckinCodeAction();
    expect(fake.tables.families[1].checkin_code).toBe("KEEPME22");
    expect(fake.tables.families[2].checkin_code).toBe("FOREIGN2");
    expect(JSON.stringify(await getMyFamilyCheckinCodeAction())).not.toMatch(/KEEPME22|FOREIGN2/);
  });

  it("takes no family id from the browser", () => {
    expect(getMyFamilyCheckinCodeAction.length).toBe(0);
  });

  it("returns no_family for a person with no profile or no family", async () => {
    mocks.requireChurchSession.mockResolvedValue(session("member", null));
    expect(await getMyFamilyCheckinCodeAction()).toEqual({ status: "no_family" });
    mocks.requireChurchSession.mockResolvedValue(session("member", "loner"));
    expect(await getMyFamilyCheckinCodeAction()).toEqual({ status: "no_family" });
  });

  it("uses the church profile id, not the login id, to find the family", async () => {
    fake.tables.profiles.push({ id: "login-1", church_id: "church-1", family_id: OTHER_FAMILY });
    const result = await getMyFamilyCheckinCodeAction();
    expect(result.status).toBe("ok");
    expect(fake.tables.families[1].checkin_code).toBe("KEEPME22");
  });
});

describe("regenerateFamilyCheckinCodeAction", () => {
  beforeEach(() => mocks.requireChurchSession.mockResolvedValue(session("church-admin", "admin-profile")));

  it.each(["member", "pastor", "secretary", "ministry-leader"])("refuses %s", async (role) => {
    mocks.requireChurchSession.mockResolvedValue(session(role));
    await expect(regenerateFamilyCheckinCodeAction({ familyId: OTHER_FAMILY })).rejects.toThrow("Unauthorized");
    expect(fake.tables.families[1].checkin_code).toBe("KEEPME22");
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it("rotates the code at once and audits without any code value", async () => {
    const result = await regenerateFamilyCheckinCodeAction({ familyId: OTHER_FAMILY });
    expect(result.status).toBe("ok");
    const newCode = fake.tables.families[1].checkin_code as string;
    expect(newCode).not.toBe("KEEPME22");

    expect(mocks.logAuditEvent).toHaveBeenCalledTimes(1);
    const event = mocks.logAuditEvent.mock.calls[0][0];
    expect(event).toMatchObject({
      tableName: "families",
      recordId: OTHER_FAMILY,
      operation: "UPDATE",
      actorId: "login-1",
      churchId: "church-1",
      actorRole: "church-admin",
    });
    expect(JSON.stringify(event)).not.toContain(newCode);
    expect(JSON.stringify(event)).not.toContain("KEEPME22");
  });

  it("cannot rotate another church's family", async () => {
    expect(await regenerateFamilyCheckinCodeAction({ familyId: FOREIGN_FAMILY })).toEqual({ status: "no_family" });
    expect(fake.tables.families[2].checkin_code).toBe("FOREIGN2");
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects a malformed family id without querying", async () => {
    expect(await regenerateFamilyCheckinCodeAction({ familyId: "x" })).toEqual({ status: "no_family" });
    expect(fake.calls).toHaveLength(0);
  });
});
