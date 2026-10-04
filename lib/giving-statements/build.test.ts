import { describe, expect, it } from "vitest";

import {
  TAX_SENTENCE,
  buildStatements,
  donorKey,
  donorRef,
  formatMoney,
  giftLocalDate,
  idempotencyKey,
  anonymousAggregate,
  maskForStaff,
  namedView,
  normalizeEmail,
  rangeInstants,
  resolveStatementRange,
  type StatementGift,
} from "./build";

const NY = "America/New_York";
const range = { start: "2025-01-01", end: "2025-12-31" };

function gift(overrides: Partial<StatementGift> & { id: string }): StatementGift {
  return {
    profileId: null,
    donorName: null,
    donorEmail: null,
    isAnonymous: false,
    amountCents: 1000,
    currency: "usd",
    fund: "General",
    status: "succeeded",
    createdAt: "2025-06-15T16:00:00.000Z",
    ...overrides,
  };
}

describe("resolveStatementRange", () => {
  it("defaults to last calendar year in the church zone", () => {
    // Jan 1 2026 02:00Z is still Dec 31 2025 in New York, so "last year" is 2024.
    const result = resolveStatementRange({}, NY, new Date("2026-01-01T02:00:00Z"));
    expect(result).toEqual({ ok: true, range: { start: "2024-01-01", end: "2024-12-31" } });
    const later = resolveStatementRange({}, NY, new Date("2026-01-01T06:00:00Z"));
    expect(later).toEqual({ ok: true, range: { start: "2025-01-01", end: "2025-12-31" } });
  });

  it("accepts a valid custom range, inclusive on both ends", () => {
    expect(resolveStatementRange({ start: "2025-03-01", end: "2025-03-01" }, NY)).toEqual({
      ok: true,
      range: { start: "2025-03-01", end: "2025-03-01" },
    });
  });

  it.each([
    [{ start: "2025-03-01" }, "both"],
    [{ end: "2025-03-01" }, "both"],
    [{ start: "2025-13-01", end: "2025-12-01" }, "real"],
    [{ start: "2025-02-30", end: "2025-03-01" }, "real"],
    [{ start: "nope", end: "2025-03-01" }, "real"],
    [{ start: "2025-04-01", end: "2025-03-01" }, "on or before"],
    [{ start: "1999-01-01", end: "2025-03-01" }, "past"],
  ])("rejects %j", (input, text) => {
    const result = resolveStatementRange(input, NY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(text);
  });
});

describe("inclusion rules and church-local boundaries", () => {
  it("counts 11:30 pm local on Dec 31 in that year though its UTC date is Jan 1", () => {
    const createdAt = "2026-01-01T04:30:00.000Z"; // 11:30 pm Dec 31 in New York (UTC-5)
    expect(giftLocalDate(createdAt, NY)).toBe("2025-12-31");
    const result = buildStatements([gift({ id: "a", profileId: "p1", createdAt })], { timeZone: NY, range });
    expect(result.statements).toHaveLength(1);
  });

  it("excludes a gift 12:30 am local on Jan 1 of the next year and counts one just after midnight starting the range", () => {
    const next = gift({ id: "n", profileId: "p1", createdAt: "2026-01-01T05:30:00.000Z" });
    const first = gift({ id: "f", profileId: "p1", createdAt: "2025-01-01T05:00:00.000Z" });
    const before = gift({ id: "b", profileId: "p1", createdAt: "2025-01-01T04:59:00.000Z" });
    const { statements } = buildStatements([next, first, before], { timeZone: NY, range });
    expect(statements[0].lines.map((l) => l.giftId)).toEqual(["f"]);
  });

  it("excludes refunded, failed, pending and cancelled gifts from everything", () => {
    const gifts = ["refunded", "failed", "pending", "cancelled"].map((status) => gift({ id: status, profileId: "p1", status }));
    const { statements, unstatementable } = buildStatements([...gifts, gift({ id: "ok", profileId: "p1", amountCents: 500 })], { timeZone: NY, range });
    expect(statements[0].giftCount).toBe(1);
    expect(statements[0].totalCents).toBe(500);
    expect(unstatementable).toEqual([]);
  });

  it("treats recurring installments like any succeeded gift", () => {
    const { statements } = buildStatements([gift({ id: "r", profileId: "p1" })], { timeZone: NY, range });
    expect(statements[0].giftCount).toBe(1);
  });

  it("uses rangeInstants as [start, endExclusive) in the church zone", () => {
    const bounds = rangeInstants(range, NY)!;
    expect(bounds.start.toISOString()).toBe("2025-01-01T05:00:00.000Z");
    expect(bounds.endExclusive.toISOString()).toBe("2026-01-01T05:00:00.000Z");
  });
});

describe("grouping", () => {
  it("groups by profile, and by normalized email when there is no profile", () => {
    const { statements } = buildStatements(
      [
        gift({ id: "1", profileId: "p1", donorEmail: "a@x.org" }),
        gift({ id: "2", profileId: "p1", donorEmail: "other@x.org" }),
        gift({ id: "3", donorEmail: "  Guest@X.org " }),
        gift({ id: "4", donorEmail: "guest@x.ORG" }),
      ],
      { timeZone: NY, range, profiles: new Map([["p1", { name: "Pat", email: "pat@x.org" }]]) },
    );
    expect(statements.map((s) => [s.donorKey, s.giftCount])).toEqual([
      ["e:guest@x.org", 2],
      ["p:p1", 2],
    ]);
    expect(statements.find((s) => s.donorKey === "p:p1")).toMatchObject({ name: "Pat", email: "pat@x.org" });
  });

  it("does not merge a guest into a member by email", () => {
    const { statements } = buildStatements(
      [gift({ id: "1", profileId: "p1" }), gift({ id: "2", donorEmail: "pat@x.org" })],
      { timeZone: NY, range, profiles: new Map([["p1", { name: "Pat", email: "pat@x.org" }]]) },
    );
    expect(statements).toHaveLength(2);
  });

  it("lists a gift with no profile and no email as un-statementable, never dropped", () => {
    const { statements, unstatementable } = buildStatements(
      [
        gift({ id: "anon", isAnonymous: true, fund: null, amountCents: 700 }),
        gift({ id: "none", amountCents: 900 }),
        gift({ id: "blank", donorEmail: "   ", amountCents: 100 }),
      ],
      { timeZone: NY, range },
    );
    expect(statements).toEqual([]);
    expect(unstatementable).toEqual([
      expect.objectContaining({ giftId: "anon", donor: "Anonymous", fund: "Unassigned", amountCents: 700, date: "2025-06-15" }),
      expect.objectContaining({ giftId: "blank", donor: "No donor information" }),
      expect.objectContaining({ giftId: "none", donor: "No donor information" }),
    ]);
  });
});

describe("totals", () => {
  it("computes per-fund subtotals and a grand total exact in cents", () => {
    const { statements } = buildStatements(
      [
        gift({ id: "1", profileId: "p1", fund: "General", amountCents: 1999 }),
        gift({ id: "2", profileId: "p1", fund: "General", amountCents: 1 }),
        gift({ id: "3", profileId: "p1", fund: "Missions", amountCents: 3333 }),
        gift({ id: "4", profileId: "p1", fund: null, amountCents: 5 }),
        gift({ id: "5", profileId: "p1", fund: "  ", amountCents: 5 }),
      ],
      { timeZone: NY, range },
    );
    const s = statements[0];
    expect(s.fundSubtotals).toEqual([
      { fund: "General", currency: "usd", cents: 2000, count: 2 },
      { fund: "Missions", currency: "usd", cents: 3333, count: 1 },
      { fund: "Unassigned", currency: "usd", cents: 10, count: 2 },
    ]);
    expect(s.grandTotals).toEqual([{ currency: "usd", cents: 5343 }]);
    expect(s.totalCents).toBe(5343);
  });

  it("shows subtotals and totals per currency when currencies are mixed", () => {
    const { statements } = buildStatements(
      [gift({ id: "1", profileId: "p1", currency: "usd", amountCents: 100 }), gift({ id: "2", profileId: "p1", currency: "EUR", amountCents: 200 })],
      { timeZone: NY, range },
    );
    expect(statements[0].grandTotals).toEqual([
      { currency: "eur", cents: 200 },
      { currency: "usd", cents: 100 },
    ]);
  });

  it("formats money", () => {
    expect(formatMoney(123456, "usd")).toBe("$1,234.56");
    expect(formatMoney(5, "zz9")).toBe("0.05 ZZ9");
  });
});

describe("anonymous gifts and staff views", () => {
  const profiles = new Map([["p1", { name: "Pat Giver", email: "pat@x.org" }]]);

  it("keeps a donor's own anonymous gifts on their own statement", () => {
    const { statements } = buildStatements(
      [gift({ id: "1", profileId: "p1", isAnonymous: true, amountCents: 400 }), gift({ id: "2", profileId: "p1", amountCents: 600 })],
      { timeZone: NY, range, profiles },
    );
    expect(statements[0].lines).toHaveLength(2);
    expect(statements[0].totalCents).toBe(1000);
    expect(statements[0].lines.filter((l) => l.anonymous)).toHaveLength(1);
  });

  it("shows staff only the named gifts: name, named count, named totals", () => {
    const { statements } = buildStatements(
      [gift({ id: "1", profileId: "p1", isAnonymous: true, amountCents: 400 }), gift({ id: "2", profileId: "p1", amountCents: 600 })],
      { timeZone: NY, range, profiles },
    );
    const row = maskForStaff(statements[0])!;
    expect(row).toEqual({
      donorRef: "p:p1",
      name: "Pat Giver",
      giftCount: 1,
      totalCents: 600,
      fundSubtotals: [{ fund: "General", currency: "usd", cents: 600, count: 1 }],
      grandTotals: [{ currency: "usd", cents: 600 }],
    });
    expect(Object.keys(row).join()).not.toMatch(/anonym|masked/i);
  });

  it("gives an anonymous-only donor no staff row at all", () => {
    const { statements } = buildStatements([gift({ id: "1", profileId: "p1", isAnonymous: true, amountCents: 400 })], { timeZone: NY, range, profiles });
    expect(statements).toHaveLength(1);
    expect(maskForStaff(statements[0])).toBeNull();
    expect(namedView(statements[0])).toBeNull();
  });

  it("never takes a staff name from an anonymous gift", () => {
    const { statements } = buildStatements(
      [
        gift({ id: "1", donorEmail: "sam@x.org", donorName: "Secret Sam", isAnonymous: true }),
        gift({ id: "2", donorEmail: "sam@x.org", donorName: "Sam Named" }),
      ],
      { timeZone: NY, range },
    );
    expect(statements[0].name).toBe("Secret Sam"); // the donor's own statement
    const row = maskForStaff(statements[0])!;
    expect(row.name).toBe("Sam Named");
    expect(JSON.stringify(row)).not.toContain("Secret Sam");
    expect(JSON.stringify(row)).not.toContain("sam@x.org");
    expect(row.donorRef).toMatch(/^h:[0-9a-f]{16}$/);
  });

  it("aggregates every anonymous gift with no donor link, including un-statementable ones", () => {
    const { statements, unstatementable } = buildStatements(
      [
        gift({ id: "1", profileId: "p1", isAnonymous: true, amountCents: 400 }),
        gift({ id: "2", profileId: "p1", amountCents: 600 }),
        gift({ id: "3", donorEmail: "g@x.org", isAnonymous: true, amountCents: 50, currency: "EUR" }),
        gift({ id: "4", isAnonymous: true, amountCents: 7 }),
        gift({ id: "5", amountCents: 9 }),
      ],
      { timeZone: NY, range, profiles },
    );
    expect(anonymousAggregate(statements, unstatementable)).toEqual({
      giftCount: 3,
      totalCents: 457,
      totalsByCurrency: [
        { currency: "eur", cents: 50 },
        { currency: "usd", cents: 407 },
      ],
    });
  });

  it("namedView drops anonymous lines and recomputes totals", () => {
    const { statements } = buildStatements(
      [gift({ id: "1", profileId: "p1", isAnonymous: true, amountCents: 400 }), gift({ id: "2", profileId: "p1", amountCents: 600 })],
      { timeZone: NY, range, profiles },
    );
    const view = namedView(statements[0])!;
    expect(view.lines.map((l) => l.giftId)).toEqual(["2"]);
    expect(view.totalCents).toBe(600);
    expect(view.anonymousGiftCount).toBe(0);
  });
});

describe("keys", () => {
  it("builds donor keys and normalizes emails", () => {
    expect(donorKey({ profileId: "p1", donorEmail: "a@b.c" })).toBe("p:p1");
    expect(donorKey({ profileId: null, donorEmail: " A@B.c " })).toBe("e:a@b.c");
    expect(donorKey({ profileId: null, donorEmail: "" })).toBeNull();
    expect(normalizeEmail("  X@Y.Z ")).toBe("x@y.z");
    expect(normalizeEmail(null)).toBeNull();
  });

  it("gives a stable idempotency key per church, donor and range", () => {
    expect(idempotencyKey("c1", "p:p1", range)).toBe("giving-statement:v1:c1:p:p1:2025-01-01:2025-12-31");
    const guest = idempotencyKey("c1", "e:someone@example.org", range);
    expect(guest).toBe(`giving-statement:v1:c1:${donorRef("e:someone@example.org")}:2025-01-01:2025-12-31`);
    expect(guest).not.toContain("someone");
    expect(guest).not.toContain("@");
    expect(idempotencyKey("c1", "p:p1", { start: "2025-01-01", end: "2025-06-30" })).not.toBe(idempotencyKey("c1", "p:p1", range));
    expect(idempotencyKey("c2", "p:p1", range)).not.toBe(idempotencyKey("c1", "p:p1", range));
  });

  it("hashes guest refs and passes profile refs through", () => {
    expect(donorRef("e:a@b.c")).toBe(donorRef("e:a@b.c"));
    expect(donorRef("p:abc")).toBe("p:abc");
  });

  it("states the fixed tax sentence", () => {
    expect(TAX_SENTENCE).toBe("No goods or services were provided in exchange for these contributions.");
  });
});
