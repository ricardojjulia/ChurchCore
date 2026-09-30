import { describe, expect, it } from "vitest";

import {
  MAX_BLOCKOUT_RANGE_DAYS,
  expandBlockoutRange,
  groupBlockoutRanges,
  churchToday,
  validateBlockoutRemoval,
} from "@/lib/blockout-dates";

const NOW = new Date("2026-10-01T15:00:00Z");

describe("expandBlockoutRange", () => {
  it("uses the church's today, so a church at UTC−4 can still mark today in the evening (G1.6)", () => {
    // 9:30 pm on Oct 5 in New York; UTC is already on Oct 6.
    const evening = new Date("2026-10-06T01:30:00Z");
    expect(expandBlockoutRange({ from: "2026-10-05" }, evening, "America/New_York")).toMatchObject({ ok: true });
    expect(expandBlockoutRange({ from: "2026-10-05" }, evening, "UTC")).toMatchObject({ ok: false, code: "past" });
  });

  it("expands a single day", () => {
    expect(expandBlockoutRange({ from: "2026-10-04" }, NOW)).toEqual({ ok: true, dates: ["2026-10-04"], reason: null });
  });

  it("expands an inclusive range across a month boundary and trims the reason", () => {
    const result = expandBlockoutRange({ from: "2026-10-30", to: "2026-11-02", reason: "  Family trip  " }, NOW);
    expect(result).toEqual({
      ok: true,
      dates: ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"],
      reason: "Family trip",
    });
  });

  it("allows today but not the past", () => {
    expect(expandBlockoutRange({ from: churchToday("UTC", NOW) }, NOW)).toMatchObject({ ok: true });
    expect(expandBlockoutRange({ from: "2026-09-30" }, NOW)).toEqual({
      ok: false,
      code: "past",
      error: "You can't mark a date in the past.",
    });
  });

  it("rejects bad input: invalid or impossible dates, reversed ranges", () => {
    expect(expandBlockoutRange({ from: "10/04/2026" }, NOW)).toMatchObject({ ok: false });
    expect(expandBlockoutRange({ from: "2026-02-30" }, NOW)).toMatchObject({ ok: false });
    expect(expandBlockoutRange({ from: "2026-10-05", to: "2026-10-04" }, NOW)).toEqual({
      ok: false,
      code: "end_before_start",
      error: "The end date is before the start date.",
    });
  });

  it("caps a range's length and how far ahead it can go", () => {
    const ninetyDaysLater = new Date(Date.parse("2026-10-02T00:00:00Z") + (MAX_BLOCKOUT_RANGE_DAYS - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(expandBlockoutRange({ from: "2026-10-02", to: ninetyDaysLater }, NOW)).toMatchObject({ ok: true });
    expect(expandBlockoutRange({ from: "2026-10-02", to: "2027-01-01" }, NOW)).toMatchObject({ ok: false });
    expect(expandBlockoutRange({ from: "2027-12-01" }, NOW)).toMatchObject({ ok: false });
  });
});

describe("validateBlockoutRemoval", () => {
  it("accepts a day or range starting today or later, and rejects the past and bad input", () => {
    expect(validateBlockoutRemoval({ from: "2026-10-01" }, NOW)).toEqual({ ok: true, from: "2026-10-01", to: "2026-10-01" });
    expect(validateBlockoutRemoval({ from: "2026-10-03", to: "2026-10-24" }, NOW)).toEqual({
      ok: true,
      from: "2026-10-03",
      to: "2026-10-24",
    });
    expect(validateBlockoutRemoval({ from: "2026-09-30" }, NOW)).toMatchObject({ ok: false, code: "past" });
    expect(validateBlockoutRemoval({ from: "nope" }, NOW)).toMatchObject({ ok: false, code: "invalid_date" });
    expect(validateBlockoutRemoval({ from: "2026-10-05", to: "2026-10-04" }, NOW)).toMatchObject({ ok: false });
  });
});

describe("groupBlockoutRanges", () => {
  it("groups consecutive days that share a reason, and splits on a gap or a different reason", () => {
    expect(
      groupBlockoutRanges([
        { date: "2026-10-05", reason: "Trip" },
        { date: "2026-10-03", reason: "Trip" },
        { date: "2026-10-04", reason: "Trip" },
        { date: "2026-10-06", reason: "Work" },
        { date: "2026-10-09", reason: "Work" },
        { date: "2026-10-31", reason: null },
        { date: "2026-11-01", reason: null },
      ]),
    ).toEqual([
      { from: "2026-10-03", to: "2026-10-05", days: 3, reason: "Trip" },
      { from: "2026-10-06", to: "2026-10-06", days: 1, reason: "Work" },
      { from: "2026-10-09", to: "2026-10-09", days: 1, reason: "Work" },
      { from: "2026-10-31", to: "2026-11-01", days: 2, reason: null },
    ]);
    expect(groupBlockoutRanges([])).toEqual([]);
  });
});
