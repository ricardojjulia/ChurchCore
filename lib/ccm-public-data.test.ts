import { describe, expect, it } from "vitest";

import {
  evaluatePublicCcmSessionAvailability,
  type PublicCcmSessionRecord,
} from "@/lib/ccm-public-data";

function baseRecord(overrides: Partial<PublicCcmSessionRecord> = {}): PublicCcmSessionRecord {
  return {
    churchId: "church-1",
    serviceId: "service-1",
    ministryId: "ministry-1",
    churchName: "Grace Harbor Church",
    serviceName: "Sunday Children",
    serviceDate: "2026-05-27",
    serviceStatus: "open",
    sessionStatus: "enabled",
    sessionStartsAt: null,
    sessionEndsAt: null,
    sessionEnabledAt: null,
    token: "token-1",
    ...overrides,
  };
}

describe("evaluatePublicCcmSessionAvailability", () => {
  it("returns not-found when no record exists", () => {
    const result = evaluatePublicCcmSessionAvailability(null, "checkin");
    expect(result.state).toBe("not-found");
  });

  it("returns paused when session is paused", () => {
    const result = evaluatePublicCcmSessionAvailability(
      baseRecord({ sessionStatus: "paused" }),
      "checkin",
    );

    expect(result.state).toBe("paused");
  });

  it("returns window-closed when current time exceeds configured window", () => {
    const now = new Date("2026-05-27T14:00:00.000Z").getTime();
    const result = evaluatePublicCcmSessionAvailability(
      baseRecord({
        sessionStartsAt: "2026-05-27T08:00:00.000Z",
        sessionEndsAt: "2026-05-27T12:00:00.000Z",
      }),
      "checkout",
      now,
    );

    expect(result.state).toBe("window-closed");
  });

  it("returns session-expired when enabled session has no end window and is older than 24h", () => {
    const now = new Date("2026-05-28T12:00:00.000Z").getTime();
    const result = evaluatePublicCcmSessionAvailability(
      baseRecord({
        sessionEnabledAt: "2026-05-27T09:00:00.000Z",
        sessionEndsAt: null,
      }),
      "checkin",
      now,
    );

    expect(result.state).toBe("session-expired");
  });
});
