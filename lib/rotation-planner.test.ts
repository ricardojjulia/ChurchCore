import { describe, expect, it } from "vitest";

import {
  BURNOUT_SHIFT_THRESHOLD,
  countMatchedSkills,
  proposePlanFill,
  rankVolunteersForPosition,
  shiftWindowForPlan,
} from "@/lib/rotation-planner";
import type { VolunteerPoolEntry } from "@/lib/volunteer-types";

const SERVICE_DATE = "2026-10-06";

function volunteer(overrides: Partial<VolunteerPoolEntry> & { fullName: string }): VolunteerPoolEntry {
  return {
    profileId: overrides.fullName.toLowerCase().replace(/\s+/g, "-"),
    email: null,
    phone: null,
    skills: [],
    maxServicesPerMonth: null,
    isVolunteer: true,
    isBlocked: false,
    servingOnDate: false,
    recentShiftCount: 0,
    monthShiftCount: 0,
    lastServedAt: null,
    roleServedCount: 0,
    totalHours: 0,
    ...overrides,
  };
}

describe("countMatchedSkills", () => {
  it("matches case-insensitively and ignores surrounding whitespace", () => {
    expect(countMatchedSkills(["Vocals", " leadership "], ["vocals", "Leadership", "guitar"])).toBe(2);
    expect(countMatchedSkills([], ["vocals"])).toBe(0);
  });
});

describe("rankVolunteersForPosition", () => {
  it("marks each ineligibility reason and keeps ineligible volunteers visible, last", () => {
    const pool = [
      volunteer({ fullName: "Blocked Ben", isBlocked: true }),
      volunteer({ fullName: "Busy Bea", servingOnDate: true }),
      volunteer({ fullName: "Capped Cal", maxServicesPerMonth: 1, monthShiftCount: 1 }),
      volunteer({ fullName: "Tired Tom", recentShiftCount: BURNOUT_SHIFT_THRESHOLD }),
      volunteer({ fullName: "Free Fran" }),
    ];

    const ranked = rankVolunteersForPosition(pool, [], SERVICE_DATE);

    expect(ranked[0]).toMatchObject({ fullName: "Free Fran", eligible: true });
    const byName = Object.fromEntries(ranked.map((r) => [r.fullName, r]));
    expect(byName["Blocked Ben"].ineligibleReasons).toEqual(["blocked"]);
    expect(byName["Busy Bea"].ineligibleReasons).toEqual(["serving_on_date"]);
    expect(byName["Capped Cal"].ineligibleReasons).toEqual(["monthly_limit"]);
    expect(byName["Tired Tom"].ineligibleReasons).toEqual(["high_load"]);
    expect(ranked.slice(1).every((r) => !r.eligible)).toBe(true);
    expect(byName["Blocked Ben"].reasons).toContain("Unavailable that day");
  });

  it("never suggests someone who isn't a known volunteer, even for a role with no required skills", () => {
    const ranked = rankVolunteersForPosition(
      [volunteer({ fullName: "Member Only", isVolunteer: false }), volunteer({ fullName: "Real Volunteer", recentShiftCount: 2 })],
      [],
      SERVICE_DATE,
    );
    expect(ranked.map((r) => [r.fullName, r.eligible])).toEqual([
      ["Real Volunteer", true],
      ["Member Only", false],
    ]);
    expect(ranked[1].ineligibleReasons).toEqual(["not_volunteer"]);
    expect(ranked[1].reasons).toContain("Not a volunteer yet");

    const proposal = proposePlanFill(
      [{ positionId: "u1", roleTypeId: null, roleName: "Usher", requiredSkills: [] }, { positionId: "u2", roleTypeId: null, roleName: "Usher", requiredSkills: [] }],
      () => [volunteer({ fullName: "Member Only", isVolunteer: false }), volunteer({ fullName: "Real Volunteer" })],
      SERVICE_DATE,
    );
    expect(proposal.map((p) => p.fullName)).toEqual(["Real Volunteer", null]);
  });

  it("a monthly limit below the month's count is not reached", () => {
    const [entry] = rankVolunteersForPosition(
      [volunteer({ fullName: "Two Max", maxServicesPerMonth: 2, monthShiftCount: 1 })],
      [],
      SERVICE_DATE,
    );
    expect(entry.eligible).toBe(true);
  });

  it("orders eligible volunteers by skills matched, then lighter load, then longest rested, then name", () => {
    const pool = [
      volunteer({ fullName: "One Skill", skills: ["vocals"] }),
      volunteer({ fullName: "Busy Pro", skills: ["vocals", "leadership"], recentShiftCount: 2 }),
      volunteer({ fullName: "Recent Pro", skills: ["vocals", "leadership"], recentShiftCount: 1, lastServedAt: "2026-09-29T10:00:00Z" }),
      volunteer({ fullName: "Rested Pro", skills: ["vocals", "leadership"], recentShiftCount: 1, lastServedAt: "2026-09-08T10:00:00Z" }),
      volunteer({ fullName: "Aa Never", skills: ["vocals", "leadership"], recentShiftCount: 1 }),
    ];

    const names = rankVolunteersForPosition(pool, ["vocals", "leadership"], SERVICE_DATE).map((r) => r.fullName);

    expect(names).toEqual(["Aa Never", "Rested Pro", "Recent Pro", "Busy Pro", "One Skill"]);
  });

  it("explains itself with skill, rest, load and role-history chips", () => {
    const [entry] = rankVolunteersForPosition(
      [volunteer({ fullName: "James", skills: ["vocals"], lastServedAt: "2026-09-22T10:00:00Z", recentShiftCount: 1, roleServedCount: 2 })],
      ["vocals", "leadership"],
      SERVICE_DATE,
    );
    expect(entry.reasons).toEqual([
      "1/2 skills",
      "Last served 2 weeks before this service",
      "1 shift in 30 days",
      "Served this role 2×",
    ]);
  });
});

describe("proposePlanFill", () => {
  const slot = (positionId: string, roleName: string, requiredSkills: string[]) => ({
    positionId,
    roleTypeId: roleName,
    roleName,
    requiredSkills,
  });

  it("never proposes the same volunteer twice in a plan", () => {
    const pool = [volunteer({ fullName: "Only One", skills: ["hospitality"] })];
    const proposal = proposePlanFill(
      [slot("g1", "Greeter", ["hospitality"]), slot("g2", "Greeter", ["hospitality"])],
      () => pool,
      SERVICE_DATE,
    );
    expect(proposal.map((p) => p.fullName)).toEqual(["Only One", null]);
  });

  it("a volunteer who fills one role isn't proposed for another in the same plan", () => {
    const pool = [
      volunteer({ fullName: "Near Limit", skills: ["audio", "hospitality"] }),
      volunteer({ fullName: "Backup", skills: ["hospitality"], recentShiftCount: 2 }),
    ];
    // Near Limit fills sound; for greeter they're already used in the plan,
    // so Backup is next even though Near Limit ranks higher on load.
    const proposal = proposePlanFill(
      [slot("s1", "Sound", ["audio"]), slot("g1", "Greeter", ["hospitality"])],
      () => pool,
      SERVICE_DATE,
    );
    expect(proposal.map((p) => p.fullName)).toEqual(["Near Limit", "Backup"]);
  });

  it("leaves a slot empty rather than proposing someone without any required skill", () => {
    const proposal = proposePlanFill(
      [slot("w1", "Worship Leader", ["vocals"])],
      () => [volunteer({ fullName: "No Voice", skills: ["audio"] })],
      SERVICE_DATE,
    );
    expect(proposal[0]).toMatchObject({ profileId: null, fullName: null });
  });

  it("reproduces the seeded demo scenario (supabase/seed.sql)", () => {
    const pool = [
      volunteer({ fullName: "Aisha Thompson", skills: ["vocals", "leadership"] }),
      volunteer({ fullName: "Carlos Martinez", skills: ["hospitality"], maxServicesPerMonth: 1, monthShiftCount: 1, recentShiftCount: 1, lastServedAt: "2026-10-01T09:30:00Z" }),
      volunteer({ fullName: "Elena Martinez", skills: ["hospitality"], isBlocked: true }),
      volunteer({ fullName: "Grace Adeyemi", skills: ["audio"], recentShiftCount: 1, lastServedAt: "2026-09-16T10:00:00Z" }),
      volunteer({ fullName: "James Ortega", skills: ["vocals", "leadership"], recentShiftCount: 1, lastServedAt: "2026-09-22T10:00:00Z", roleServedCount: 1 }),
      volunteer({ fullName: "Marcus Williams", skills: ["audio"], recentShiftCount: 3, lastServedAt: "2026-09-29T10:00:00Z" }),
      volunteer({ fullName: "Maya Martinez", skills: ["hospitality"] }),
      volunteer({ fullName: "Samuel Price", skills: ["hospitality", "leadership"], recentShiftCount: 1, lastServedAt: "2026-09-29T09:30:00Z" }),
    ];

    const proposal = proposePlanFill(
      [
        slot("wl", "Worship Leader", ["vocals", "leadership"]),
        slot("snd", "Sound Tech", ["audio"]),
        slot("g1", "Greeter", ["hospitality"]),
        slot("g2", "Greeter", ["hospitality"]),
      ],
      () => pool,
      SERVICE_DATE,
    );

    expect(proposal.map((p) => p.fullName)).toEqual([
      "Aisha Thompson",
      "Grace Adeyemi",
      "Maya Martinez",
      "Samuel Price",
    ]);
  });
});

describe("shiftWindowForPlan", () => {
  it("starts at the service time and ends two hours later", () => {
    expect(shiftWindowForPlan("2026-10-06", "10:00:00")).toEqual({
      startsAt: "2026-10-06T10:00:00",
      endsAt: "2026-10-06T12:00:00",
    });
  });

  it("defaults to 09:00 when the plan has no service time", () => {
    expect(shiftWindowForPlan("2026-10-06", null)).toEqual({
      startsAt: "2026-10-06T09:00:00",
      endsAt: "2026-10-06T11:00:00",
    });
  });

  it("rolls the end over midnight into the next day", () => {
    expect(shiftWindowForPlan("2026-10-31", "23:30")).toEqual({
      startsAt: "2026-10-31T23:30:00",
      endsAt: "2026-11-01T01:30:00",
    });
  });
});
