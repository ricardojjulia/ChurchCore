import { describe, expect, it } from "vitest";

import {
  normalizeRegistrationPaymentStatus,
  resolveRegistrationLifecycle,
} from "@/lib/event-registration-lifecycle";

describe("resolveRegistrationLifecycle", () => {
  it("returns pending payment for paid confirmed registrations", () => {
    expect(
      resolveRegistrationLifecycle({
        isWaitlisted: false,
        approvalRequired: false,
        priceCents: 1500,
      }),
    ).toEqual({ status: "confirmed", paymentStatus: "pending" });
  });

  it("returns not_required payment for waitlisted paid registrations", () => {
    expect(
      resolveRegistrationLifecycle({
        isWaitlisted: true,
        approvalRequired: false,
        priceCents: 1500,
      }),
    ).toEqual({ status: "waitlisted", paymentStatus: "not_required" });
  });
});

describe("normalizeRegistrationPaymentStatus", () => {
  it("normalizes missing status for paid pending approval registrations", () => {
    expect(
      normalizeRegistrationPaymentStatus({
        status: "pending_approval",
        isWaitlisted: false,
        amountPaidCents: 0,
        storedPaymentStatus: null,
        priceCents: 1500,
      }),
    ).toBe("pending");
  });

  it("normalizes pending waitlist rows to not_required", () => {
    expect(
      normalizeRegistrationPaymentStatus({
        status: "waitlisted",
        isWaitlisted: true,
        amountPaidCents: 0,
        storedPaymentStatus: "pending",
        priceCents: 1500,
      }),
    ).toBe("not_required");
  });

  it("keeps paid when amount is recorded", () => {
    expect(
      normalizeRegistrationPaymentStatus({
        status: "confirmed",
        isWaitlisted: false,
        amountPaidCents: 1500,
        storedPaymentStatus: "pending",
        priceCents: 1500,
      }),
    ).toBe("paid");
  });
});
