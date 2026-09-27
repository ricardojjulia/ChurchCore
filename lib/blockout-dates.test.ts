import { describe, expect, it } from "vitest";

import {
  MAX_BLOCKOUT_RANGE_DAYS,
  expandBlockoutRange,
  todayUtc,
  validateBlockoutDay,
} from "@/lib/blockout-dates";

const NOW = new Date("2026-10-01T15:00:00Z");

describe("expandBlockoutRange", () => {
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
    expect(expandBlockoutRange({ from: todayUtc(NOW) }, NOW)).toMatchObject({ ok: true });
    expect(expandBlockoutRange({ from: "2026-09-30" }, NOW)).toEqual({ ok: false, error: "You can't mark a date in the past." });
  });

  it("rejects bad input: invalid or impossible dates, reversed ranges", () => {
    expect(expandBlockoutRange({ from: "10/04/2026" }, NOW)).toMatchObject({ ok: false });
    expect(expandBlockoutRange({ from: "2026-02-30" }, NOW)).toMatchObject({ ok: false });
    expect(expandBlockoutRange({ from: "2026-10-05", to: "2026-10-04" }, NOW)).toEqual({
      ok: false,
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

describe("validateBlockoutDay", () => {
  it("accepts today and later, rejects the past and bad input", () => {
    expect(validateBlockoutDay("2026-10-01", NOW)).toBeNull();
    expect(validateBlockoutDay("2026-12-25", NOW)).toBeNull();
    expect(validateBlockoutDay("2026-09-30", NOW)).toBe("Past dates can't be changed.");
    expect(validateBlockoutDay("nope", NOW)).toBe("Choose a valid date.");
  });
});
