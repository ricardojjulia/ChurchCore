import { describe, expect, it } from "vitest";

import { startOfDayInTimeZone, todayInTimeZone } from "@/lib/church-time";

// G1.6 (FS3-4): "today" is the church's today, not UTC's.

describe("todayInTimeZone", () => {
  it("keeps an evening at UTC−4 on its own day, where UTC has already moved on", () => {
    // 8:30 pm on Monday, October 5 in New York is already Tuesday in UTC.
    const eveningInNewYork = new Date("2026-10-06T00:30:00Z");
    expect(todayInTimeZone("America/New_York", eveningInNewYork)).toBe("2026-10-05");
    expect(todayInTimeZone("UTC", eveningInNewYork)).toBe("2026-10-06");
  });

  it("moves ahead of UTC for a church east of Greenwich", () => {
    expect(todayInTimeZone("Asia/Tokyo", new Date("2026-10-05T20:00:00Z"))).toBe("2026-10-06");
  });

  it("falls back to UTC for a missing or unknown zone", () => {
    const now = new Date("2026-10-06T00:30:00Z");
    expect(todayInTimeZone(null, now)).toBe("2026-10-06");
    expect(todayInTimeZone("Not/AZone", now)).toBe("2026-10-06");
  });
});

describe("startOfDayInTimeZone", () => {
  it("is local midnight as a real instant", () => {
    expect(startOfDayInTimeZone("2026-10-05", "America/New_York")!.toISOString()).toBe("2026-10-05T04:00:00.000Z");
    expect(startOfDayInTimeZone("2026-12-05", "America/New_York")!.toISOString()).toBe("2026-12-05T05:00:00.000Z");
  });

  it("gets the offset right on the days daylight saving time changes", () => {
    // US clocks fall back at 2 am on Nov 1, 2026, so that midnight is still EDT.
    expect(startOfDayInTimeZone("2026-11-01", "America/New_York")!.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(startOfDayInTimeZone("2026-11-02", "America/New_York")!.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    // Spring forward at 2 am on Mar 8, 2026: that midnight is still EST.
    expect(startOfDayInTimeZone("2026-03-08", "America/New_York")!.toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });

  it("returns the first instant of the day where DST skips midnight (Council Review 24)", () => {
    // Santiago springs forward at 00:00 on Sep 6, 2026: the day starts at 01:00 (-03).
    expect(startOfDayInTimeZone("2026-09-06", "America/Santiago")!.toISOString()).toBe("2026-09-06T04:00:00.000Z");
    // Havana springs forward at 00:00 on Mar 8, 2026: the day starts at 01:00 (-04).
    expect(startOfDayInTimeZone("2026-03-08", "America/Havana")!.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    // Santiago falls back at 24:00 on Apr 4, 2026: Apr 5 starts at the second midnight (-04).
    expect(startOfDayInTimeZone("2026-04-05", "America/Santiago")!.toISOString()).toBe("2026-04-05T04:00:00.000Z");
  });

  it("handles offsets that aren't whole hours", () => {
    expect(startOfDayInTimeZone("2026-10-05", "Asia/Kolkata")!.toISOString()).toBe("2026-10-04T18:30:00.000Z");
  });

  it("is null for a malformed day", () => {
    expect(startOfDayInTimeZone("2026-13-45", "America/New_York")).toBeNull();
  });

  it("is UTC midnight for UTC or an unknown zone", () => {
    expect(startOfDayInTimeZone("2026-10-05", "UTC")!.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(startOfDayInTimeZone("2026-10-05", undefined)!.toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });
});
