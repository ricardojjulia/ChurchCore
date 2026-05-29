import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: vi.fn(),
  queryTenantLocalDb: vi.fn(),
  shouldUseLocalTenantFallback: vi.fn(() => true),
}));

import { classifyPeopleImportRows } from "@/lib/people-import-dry-run";

describe("classifyPeopleImportRows", () => {
  it("classifies create, update, skip, and reject deterministically", () => {
    const result = classifyPeopleImportRows(
      [
        {
          rowNumber: 2,
          householdName: "River Family",
          fullName: "Ada Lovelace",
          email: "ada@example.com",
          phone: "5550101",
          memberNumber: "M-001",
        },
        {
          rowNumber: 3,
          householdName: "River Family",
          fullName: "Ada Lovelace",
          email: "ada@example.com",
          phone: "5550101",
          memberNumber: "M-001",
        },
        {
          rowNumber: 4,
          householdName: "Harbor House",
          fullName: "Grace Hopper",
          email: "grace@example.com",
          phone: "5550202",
          memberNumber: null,
        },
        {
          rowNumber: 5,
          householdName: "No Name",
          fullName: "",
          email: "bad@example.com",
          phone: "5550303",
          memberNumber: null,
        },
      ],
      {
        byMemberNumber: new Map([["M-001", "profile-1"]]),
        byEmail: new Map(),
        byNamePhone: new Map(),
        familyNames: new Set(["river family"]),
      },
    );

    expect(result.counts).toEqual({
      create: 1,
      update: 1,
      skip: 1,
      reject: 1,
    });
    expect(result.householdCreates).toBe(1);
    expect(result.rows.map((row) => row.action)).toEqual([
      "update",
      "skip",
      "create",
      "reject",
    ]);
  });

  it("rejects malformed emails", () => {
    const result = classifyPeopleImportRows(
      [
        {
          rowNumber: 2,
          householdName: null,
          fullName: "Invalid Email",
          email: "invalid-email",
          phone: null,
          memberNumber: null,
        },
      ],
      {
        byMemberNumber: new Map(),
        byEmail: new Map(),
        byNamePhone: new Map(),
        familyNames: new Set(),
      },
    );

    expect(result.counts.reject).toBe(1);
    expect(result.rows[0]?.reason).toBe("Invalid email format.");
  });
});
