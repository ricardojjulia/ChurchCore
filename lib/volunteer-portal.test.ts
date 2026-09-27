import { describe, expect, it } from "vitest";

import { describePublicShift } from "@/lib/volunteer-portal";

describe("describePublicShift", () => {
  const shift = {
    id: "s-1",
    title: "Greeter",
    confirmation_status: "pending",
    starts_at: "2026-10-06T10:00:00+00:00",
    ends_at: "2026-10-06T12:00:00+00:00",
    events: [{ title: "Sunday", description: "Main service", starts_at: "x", ends_at: "y", category: "worship" }],
    service_plans: { name: "Sunday Worship", service_date: "2026-10-06", service_time: "10:00:00" },
  };

  it("uses the plan's date and name, the shift's own window, and the event's description", () => {
    expect(describePublicShift(shift)).toEqual({
      place: "Sunday Worship",
      description: "Main service",
      dateLabel: "Tue, Oct 6",
      timeLabel: "10:00 AM – 12:00 PM",
    });
    expect(describePublicShift(shift, "long").dateLabel).toBe("Tuesday, October 6, 2026");
  });

  it("falls back to the event title and the shift's date without a plan", () => {
    expect(describePublicShift({ ...shift, service_plans: null })).toMatchObject({
      place: "Sunday",
      dateLabel: "Tue, Oct 6",
    });
    expect(describePublicShift({ ...shift, service_plans: null, events: null }).place).toBe("Church Service");
  });
});
