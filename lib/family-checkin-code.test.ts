import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase } from "@/tests/fixtures/fake-supabase";

const mocks = vi.hoisted(() => ({ admin: { current: null as unknown } }));
vi.mock("@/lib/supabase/tenant", () => ({ createTenantAdminClient: () => mocks.admin.current }));

import {
  assignFamilyCheckinCode,
  FAMILY_CHECKIN_CODE_PATTERN,
  generateFamilyCheckinCode,
  normalizeFamilyCheckinCode,
  readFamilyCheckinCode,
} from "@/lib/family-checkin-code";

beforeEach(() => vi.clearAllMocks());

describe("generateFamilyCheckinCode", () => {
  it("makes 8 Crockford base32 characters with no I, L, O or U", () => {
    for (let i = 0; i < 500; i += 1) {
      const code = generateFamilyCheckinCode();
      expect(code).toMatch(FAMILY_CHECKIN_CODE_PATTERN);
      expect(code).not.toMatch(/[ILOU]/);
    }
  });
  it("does not repeat", () => {
    const codes = new Set(Array.from({ length: 200 }, generateFamilyCheckinCode));
    expect(codes.size).toBe(200);
  });
});

describe("normalizeFamilyCheckinCode", () => {
  it("folds case, separators and look-alikes", () => {
    expect(normalizeFamilyCheckinCode("hk7m-2qx9")).toBe("HK7M2QX9");
    expect(normalizeFamilyCheckinCode(" hk7m 2qx9 ")).toBe("HK7M2QX9");
    expect(normalizeFamilyCheckinCode("OIL00000")).toBe("01100000");
  });
  it("rejects wrong lengths, forbidden letters and non-strings", () => {
    expect(normalizeFamilyCheckinCode("HK7M2QX")).toBeNull();
    expect(normalizeFamilyCheckinCode("HK7M2QX99")).toBeNull();
    expect(normalizeFamilyCheckinCode("HK7M2QXU")).toBeNull();
    expect(normalizeFamilyCheckinCode(null)).toBeNull();
    expect(normalizeFamilyCheckinCode("A".repeat(100))).toBeNull();
  });
});

describe("assignFamilyCheckinCode", () => {
  const tables = () => ({
    families: [
      { id: "f1", church_id: "c1", checkin_code: null },
      { id: "f2", church_id: "c1", checkin_code: "OLDCODE2" },
    ],
  });

  it("fills a missing code only for the named family of the named church", async () => {
    const fake = createFakeSupabase({ tables: tables() });
    mocks.admin.current = fake.client;
    const result = await assignFamilyCheckinCode({ churchId: "c1", familyId: "f1", onlyIfMissing: true });
    expect(result.ok).toBe(true);
    expect(fake.tables.families[0].checkin_code).toMatch(FAMILY_CHECKIN_CODE_PATTERN);
    expect(fake.tables.families[0].checkin_code_rotated_at).toBeTruthy();
    expect(fake.tables.families[1].checkin_code).toBe("OLDCODE2");
  });

  it("does not overwrite an existing code when only filling; returns the existing one", async () => {
    const fake = createFakeSupabase({ tables: tables() });
    mocks.admin.current = fake.client;
    const result = await assignFamilyCheckinCode({ churchId: "c1", familyId: "f2", onlyIfMissing: true });
    expect(result).toEqual({ ok: true, code: "OLDCODE2" });
  });

  it("rotates: the old code is replaced", async () => {
    const fake = createFakeSupabase({ tables: tables() });
    mocks.admin.current = fake.client;
    const result = await assignFamilyCheckinCode({ churchId: "c1", familyId: "f2", onlyIfMissing: false });
    expect(result.ok && result.code).not.toBe("OLDCODE2");
    expect(fake.tables.families[1].checkin_code).not.toBe("OLDCODE2");
  });

  it("will not touch another church's family", async () => {
    const fake = createFakeSupabase({ tables: tables() });
    mocks.admin.current = fake.client;
    expect(await assignFamilyCheckinCode({ churchId: "c2", familyId: "f2", onlyIfMissing: false })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(fake.tables.families[1].checkin_code).toBe("OLDCODE2");
  });

  it("draws again when the code collides within the church (23505)", async () => {
    let first = true;
    const fake = createFakeSupabase({ tables: tables() });
    mocks.admin.current = {
      from: (table: string) => {
        const builder = fake.client.from(table) as { update: (v: unknown) => unknown };
        const update = builder.update.bind(builder);
        builder.update = (values: unknown) => {
          if (first) {
            first = false;
            return {
              eq: () => ({ eq: () => ({ select: async () => ({ data: null, error: { code: "23505", message: "dup" } }) }) }),
            };
          }
          return update(values);
        };
        return builder;
      },
    };
    const result = await assignFamilyCheckinCode({ churchId: "c1", familyId: "f2", onlyIfMissing: false });
    expect(result.ok).toBe(true);
  });

  it("reports failure on a database error without leaking it", async () => {
    const fake = createFakeSupabase({ tables: tables(), tableError: () => ({ message: "secret detail" }) });
    mocks.admin.current = fake.client;
    expect(await assignFamilyCheckinCode({ churchId: "c1", familyId: "f1", onlyIfMissing: false })).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(await readFamilyCheckinCode("c1", "f1")).toEqual({ ok: false, reason: "failed" });
  });
});
