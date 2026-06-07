import { describe, expect, it } from "vitest";

import {
  formatCategory,
  getCategoryColor,
  getChurchHour,
  getChurchMinute,
  getPeriodLabel,
} from "@/lib/calendar-utils";

describe("formatCategory", () => {
  it('formats "prayer" as "Prayer"', () => {
    expect(formatCategory("prayer")).toBe("Prayer");
  });

  it('formats "outreach" as "Outreach"', () => {
    expect(formatCategory("outreach")).toBe("Outreach");
  });

  it('formats "ministry" as "Ministry"', () => {
    expect(formatCategory("ministry")).toBe("Ministry");
  });

  it("formats multi-word snake_case categories", () => {
    expect(formatCategory("some_category")).toBe("Some Category");
  });
});

describe("getCategoryColor", () => {
  it('returns "#2563eb" for "worship"', () => {
    expect(getCategoryColor("worship")).toBe("#2563eb");
  });

  it('returns "#0f766e" for "prayer"', () => {
    expect(getCategoryColor("prayer")).toBe("#0f766e");
  });

  it('returns "#c2410c" for "outreach"', () => {
    expect(getCategoryColor("outreach")).toBe("#c2410c");
  });

  it('returns "#1f6feb" default fallback for unknown categories', () => {
    expect(getCategoryColor("unknown_category")).toBe("#1f6feb");
    expect(getCategoryColor("")).toBe("#1f6feb");
    expect(getCategoryColor("WORSHIP")).toBe("#1f6feb");
  });

  it("default fallback is NOT the same as the worship color", () => {
    // Regression guard: worship (#2563eb) must differ from the default (#1f6feb)
    expect(getCategoryColor("worship")).not.toBe(getCategoryColor("unknown_category"));
  });

  it("returns default color for unhandled category (general)", () => {
    expect(getCategoryColor("general")).toBe("#1f6feb");
  });
});

describe("getChurchHour", () => {
  it("returns 11 for 15:00 UTC in America/New_York (UTC-4 EDT)", () => {
    // 2026-06-07 15:00 UTC = 2026-06-07 11:00 EDT
    expect(getChurchHour("2026-06-07T15:00:00Z", "America/New_York")).toBe(11);
  });

  it("returns 20 for 00:00 UTC in America/New_York (previous day 8 PM EDT)", () => {
    // 2026-06-07 00:00 UTC = 2026-06-06 20:00 EDT
    expect(getChurchHour("2026-06-07T00:00:00Z", "America/New_York")).toBe(20);
  });

  it("returns the correct hour in UTC", () => {
    expect(getChurchHour("2026-06-07T15:00:00Z", "UTC")).toBe(15);
  });

  it("returns 0 (not 24) for midnight UTC in UTC", () => {
    expect(getChurchHour("2026-06-07T00:00:00Z", "UTC")).toBe(0);
  });
});

describe("getChurchMinute", () => {
  it("returns 30 for 15:30 UTC in UTC timezone", () => {
    expect(getChurchMinute("2026-06-07T15:30:00Z", "UTC")).toBe(30);
  });

  it("returns 0 for on-the-hour timestamps", () => {
    expect(getChurchMinute("2026-06-07T15:00:00Z", "UTC")).toBe(0);
  });

  it("returns 45 for a :45 timestamp", () => {
    expect(getChurchMinute("2026-06-07T08:45:00Z", "UTC")).toBe(45);
  });
});

describe("getPeriodLabel", () => {
  it('returns "June 2026" for month mode in June 2026', () => {
    const date = new Date(2026, 5, 7); // month index 5 = June
    expect(getPeriodLabel("month", date, "UTC")).toBe("June 2026");
  });

  it("returns a week range string for week mode", () => {
    // 2026-06-07 is a Sunday → week is Jun 7 – Jun 13, 2026
    const date = new Date(2026, 5, 7);
    const label = getPeriodLabel("week", date, "UTC");
    expect(label).toContain("Jun");
    // Should contain a year
    expect(label).toContain("2026");
    // Should contain an em-dash range separator with day numbers on either side
    // e.g. "Jun 7 – Jun 13, 2026" — digits appear before and after the separator
    expect(label).toMatch(/\d+\s*[–-]/);   // digit before separator
    expect(label).toMatch(/[–-]\s*\S*\s*\d+/); // digit after separator (possibly preceded by month name)
  });

  it("returns a day string containing Saturday and June 6 for day mode", () => {
    const date = new Date(Date.UTC(2026, 5, 6)); // June 6 2026, a Saturday
    const label = getPeriodLabel("day", date, "UTC");
    expect(label).toContain("Saturday");
    expect(label).toContain("June");
    expect(label).toContain("6");
  });

  it("returns a day string containing the correct weekday for day mode", () => {
    // 2026-06-07 is a Sunday
    const date = new Date(Date.UTC(2026, 5, 7));
    const label = getPeriodLabel("day", date, "UTC");
    expect(label).toContain("Sunday");
    expect(label).toContain("2026");
  });
});
