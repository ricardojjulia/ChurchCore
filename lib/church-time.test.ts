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
    expect(startOfDayInTimeZone("2026-10-05", "America/New_York").toISOString()).toBe("2026-10-05T04:00:00.000Z");
    expect(startOfDayInTimeZone("2026-12-05", "America/New_York").toISOString()).toBe("2026-12-05T05:00:00.000Z");
  });

  it("gets the offset right on the days daylight saving time changes", () => {
    // US clocks fall back at 2 am on Nov 1, 2026, so that midnight is still EDT.
    expect(startOfDayInTimeZone("2026-11-01", "America/New_York").toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(startOfDayInTimeZone("2026-11-02", "America/New_York").toISOString()).toBe("2026-11-02T05:00:00.000Z");
    // Spring forward at 2 am on Mar 8, 2026: that midnight is still EST.
    expect(startOfDayInTimeZone("2026-03-08", "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });

  it("is UTC midnight for UTC or an unknown zone", () => {
    expect(startOfDayInTimeZone("2026-10-05", "UTC").toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(startOfDayInTimeZone("2026-10-05", undefined).toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });
});
