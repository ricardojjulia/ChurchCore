import { describe, expect, it } from "vitest";

import { KIOSK_IDLE_MS, kioskWarningMs, resolveKioskIdleMs } from "./kiosk-idle";

describe("resolveKioskIdleMs", () => {
  it("defaults to 60 seconds", () => {
    expect(resolveKioskIdleMs({ NODE_ENV: "development" })).toBe(KIOSK_IDLE_MS);
    expect(resolveKioskIdleMs({})).toBe(KIOSK_IDLE_MS);
  });

  it("honours the override outside production", () => {
    expect(resolveKioskIdleMs({ NODE_ENV: "development", KIOSK_IDLE_MS_OVERRIDE: "5000" })).toBe(5000);
    expect(resolveKioskIdleMs({ NODE_ENV: "test", KIOSK_IDLE_MS_OVERRIDE: "2500" })).toBe(2500);
  });

  it("ignores the override in production", () => {
    expect(resolveKioskIdleMs({ NODE_ENV: "production", KIOSK_IDLE_MS_OVERRIDE: "5000" })).toBe(KIOSK_IDLE_MS);
  });

  it("ignores junk, tiny and longer-than-default values", () => {
    for (const value of ["abc", "", "0", "-5", "999", "600000", "NaN"]) {
      expect(resolveKioskIdleMs({ NODE_ENV: "development", KIOSK_IDLE_MS_OVERRIDE: value })).toBe(KIOSK_IDLE_MS);
    }
  });
});

describe("kioskWarningMs", () => {
  it("is 10 seconds at the default and half of a short idle time", () => {
    expect(kioskWarningMs(60_000)).toBe(10_000);
    expect(kioskWarningMs(4_000)).toBe(2_000);
  });
});
