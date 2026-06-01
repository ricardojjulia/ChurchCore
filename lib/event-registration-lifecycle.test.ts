import { describe, expect, it } from "vitest";

import {
  ledgerStatusToPaymentStatus,
  normalizeRegistrationPaymentStatus,
  paymentStatusToLedgerStatus,
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

  // AC14 — terminal guard: refunded status is never overwritten back to paid
  it("does not flip refunded status back to paid when amountPaidCents is positive", () => {
    expect(
      normalizeRegistrationPaymentStatus({
        status: "confirmed",
        isWaitlisted: false,
        amountPaidCents: 5000,
        storedPaymentStatus: "refunded",
        priceCents: 5000,
      }),
    ).toBe("refunded");
  });
});

describe("paymentStatusToLedgerStatus", () => {
  it("maps partially_refunded payment status to partially_refunded ledger status", () => {
    expect(paymentStatusToLedgerStatus("partially_refunded")).toBe("partially_refunded");
  });

  it("maps paid to succeeded", () => {
    expect(paymentStatusToLedgerStatus("paid")).toBe("succeeded");
  });

  it("maps refunded to refunded", () => {
    expect(paymentStatusToLedgerStatus("refunded")).toBe("refunded");
  });
});

describe("ledgerStatusToPaymentStatus", () => {
  it("maps partially_refunded ledger status to partially_refunded payment status", () => {
    expect(ledgerStatusToPaymentStatus("partially_refunded")).toBe("partially_refunded");
  });

  it("maps succeeded to paid", () => {
    expect(ledgerStatusToPaymentStatus("succeeded")).toBe("paid");
  });

  it("maps refunded to refunded", () => {
    expect(ledgerStatusToPaymentStatus("refunded")).toBe("refunded");
  });
});
