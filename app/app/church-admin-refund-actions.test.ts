import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  hasTenantBackendEnvMock,
  createRefundMock,
  reverseGlEntryForRefundMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();
  const hasTenantBackendEnv = vi.fn();
  const createRefund = vi.fn();
  const reverseGlEntryForRefund = vi.fn();

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    hasTenantBackendEnvMock: hasTenantBackendEnv,
    createRefundMock: createRefund,
    reverseGlEntryForRefundMock: reverseGlEntryForRefund,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: vi.fn(() => "http://localhost:4200") })),
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantAdminClient: vi.fn(),
  createTenantServerClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn() })) })) })),
      update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn() })) })),
    })),
  })),
  hasTenantAdminBackendEnv: vi.fn(() => false),
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

vi.mock("@/lib/stripe/event-registrations", () => ({
  createRefund: createRefundMock,
  // reverseGlEntryForRefund is called best-effort (catch swallows errors);
  // resolve silently so tests stay focused on the refund flow.
  reverseGlEntryForRefund: reverseGlEntryForRefundMock,
}));

import { initiateRegistrationRefundAction } from "@/app/app/church-admin-actions";

// ── Shared helpers ────────────────────────────────────────────

function mockHappyPathPrelude(paymentIntentId = "pi_test_1", amountCents = 5000) {
  queryTenantLocalDbMock
    .mockResolvedValueOnce({ rows: [{ id: "event-1" }] }) // assertEventBelongsToChurch
    .mockResolvedValueOnce({ rows: [{ id: "reg-1" }] }) // assertRegistrationBelongsToEvent
    .mockResolvedValueOnce({ rows: [{ payment_status: "paid" }] }) // payment_status check
    .mockResolvedValueOnce({ rows: [{ payment_intent_id: paymentIntentId, amount_cents: amountCents }] }) // payment record
    .mockResolvedValue({ rows: [] }); // subsequent updates
}

describe("initiateRegistrationRefundAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      profile: { id: "profile-1" },
      source: "supabase",
      userId: "user-1",
    });
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    hasTenantBackendEnvMock.mockReturnValue(true);
    queryTenantLocalDbMock.mockResolvedValue({ rows: [] });
    createRefundMock.mockResolvedValue({
      refundId: "re_stub_pi_test_1",
      status: "succeeded",
      amountCents: 5000,
      isStub: true,
    });
    reverseGlEntryForRefundMock.mockResolvedValue(undefined);
  });

  it("initiates full refund in stub mode", async () => {
    // hasStripeConfig() returns false in test env (no STRIPE_SECRET_KEY),
    // so createRefund returns a deterministic stub.
    mockHappyPathPrelude("pi_test_1", 5000);

    const result = await initiateRegistrationRefundAction({
      registrationId: "reg-1",
      eventId: "event-1",
      amountCents: 5000,
    });

    expect(result).toEqual({ ok: true, refundId: "re_stub_pi_test_1", isStub: true });

    // Both table updates must fire.
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registrations"),
      ["reg-1", "refunded", "church-1"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registration_payments"),
      ["reg-1", "refunded", "re_stub_pi_test_1", 5000, null, "profile-1", "church-1", expect.any(String)],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/events/event-1");
  });

  it("initiates partial refund sets partially_refunded status", async () => {
    mockHappyPathPrelude("pi_test_1", 5000);

    const result = await initiateRegistrationRefundAction({
      registrationId: "reg-1",
      eventId: "event-1",
      amountCents: 2000, // less than original 5000
    });

    expect(result).toEqual({ ok: true, refundId: "re_stub_pi_test_1", isStub: true });

    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registrations"),
      ["reg-1", "partially_refunded", "church-1"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registration_payments"),
      ["reg-1", "partially_refunded", "re_stub_pi_test_1", 2000, null, "profile-1", "church-1", expect.any(String)],
    );
  });

  it("rejects non-admin role — returns error before any DB writes", async () => {
    requireChurchSessionMock.mockRejectedValueOnce(
      new Error("Church-admin or pastor access is required."),
    );

    const result = await initiateRegistrationRefundAction({
      registrationId: "reg-1",
      eventId: "event-1",
      amountCents: 5000,
    });

    expect(result).toEqual({ ok: false, error: "Church-admin access is required." });
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("rejects when payment_status is not paid", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] }) // assertEventBelongsToChurch
      .mockResolvedValueOnce({ rows: [{ id: "reg-1" }] }) // assertRegistrationBelongsToEvent
      .mockResolvedValueOnce({ rows: [{ payment_status: "pending" }] }); // payment_status != 'paid'

    const result = await initiateRegistrationRefundAction({
      registrationId: "reg-1",
      eventId: "event-1",
      amountCents: 5000,
    });

    expect(result).toEqual({ ok: false, error: "Registration is not in a paid state." });
    // No table updates should be written.
    expect(queryTenantLocalDbMock).not.toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registrations"),
      expect.anything(),
    );
  });

  it("rejects when no payment record found", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] }) // assertEventBelongsToChurch
      .mockResolvedValueOnce({ rows: [{ id: "reg-1" }] }) // assertRegistrationBelongsToEvent
      .mockResolvedValueOnce({ rows: [{ payment_status: "paid" }] }) // payment_status = paid
      .mockResolvedValueOnce({ rows: [] }); // payment record query returns empty

    const result = await initiateRegistrationRefundAction({
      registrationId: "reg-1",
      eventId: "event-1",
      amountCents: 5000,
    });

    expect(result).toEqual({ ok: false, error: "No payment record found for this registration." });
    expect(queryTenantLocalDbMock).not.toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registrations"),
      expect.anything(),
    );
  });

  it("rejects amountCents of zero before Stripe call", async () => {
    // Validation fires after the payment record is fetched (we need the original
    // amount to bound the refund), but before createRefund is called.
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "reg-1" }] })
      .mockResolvedValueOnce({ rows: [{ payment_status: "paid" }] })
      .mockResolvedValueOnce({ rows: [{ payment_intent_id: "pi_test_1", amount_cents: 5000 }] });

    const result = await initiateRegistrationRefundAction({
      registrationId: "reg-1",
      eventId: "event-1",
      amountCents: 0,
    });

    expect(result).toEqual({ ok: false, error: "Refund amount is invalid." });
    expect(queryTenantLocalDbMock).not.toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registrations"),
      expect.anything(),
    );
  });

  it("rejects amountCents exceeding original payment amount", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "reg-1" }] })
      .mockResolvedValueOnce({ rows: [{ payment_status: "paid" }] })
      .mockResolvedValueOnce({ rows: [{ payment_intent_id: "pi_test_1", amount_cents: 5000 }] });

    const result = await initiateRegistrationRefundAction({
      registrationId: "reg-1",
      eventId: "event-1",
      amountCents: 9999, // exceeds original 5000
    });

    expect(result).toEqual({ ok: false, error: "Refund amount is invalid." });
    expect(queryTenantLocalDbMock).not.toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registrations"),
      expect.anything(),
    );
  });

  it("returns error when Stripe call fails — does not write to DB", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "reg-1" }] })
      .mockResolvedValueOnce({ rows: [{ payment_status: "paid" }] })
      .mockResolvedValueOnce({ rows: [{ payment_intent_id: "pi_fail", amount_cents: 5000 }] });

    createRefundMock.mockRejectedValueOnce(new Error("Your card was declined."));

    const result = await initiateRegistrationRefundAction({
      registrationId: "reg-1",
      eventId: "event-1",
      amountCents: 5000,
    });

    expect(result).toEqual({ ok: false, error: "Your card was declined." });
    expect(queryTenantLocalDbMock).not.toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registrations"),
      expect.anything(),
    );
    expect(queryTenantLocalDbMock).not.toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registration_payments"),
      expect.anything(),
    );
  });

  // AC4 — already-refunded status rejected
  it("rejects when payment_status is already refunded", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] }) // assertEventBelongsToChurch
      .mockResolvedValueOnce({ rows: [{ id: "reg-1" }] }) // assertRegistrationBelongsToEvent
      .mockResolvedValueOnce({ rows: [{ payment_status: "refunded" }] }); // payment_status = refunded

    const result = await initiateRegistrationRefundAction({
      registrationId: "reg-1",
      eventId: "event-1",
      amountCents: 5000,
    });

    expect(result).toEqual({ ok: false, error: "Registration is not in a paid state." });
    expect(queryTenantLocalDbMock).not.toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registrations"),
      expect.anything(),
    );
    expect(queryTenantLocalDbMock).not.toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registration_payments"),
      expect.anything(),
    );
  });

  // AC16 — reverseGlEntryForRefund called after successful refund
  it("calls reverseGlEntryForRefund after successful refund", async () => {
    mockHappyPathPrelude("pi_test_1", 5000);

    const result = await initiateRegistrationRefundAction({
      registrationId: "reg-1",
      eventId: "event-1",
      amountCents: 5000,
    });

    expect(result).toEqual({ ok: true, refundId: "re_stub_pi_test_1", isStub: true });
    expect(reverseGlEntryForRefundMock).toHaveBeenCalledOnce();
    expect(reverseGlEntryForRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        churchId: "church-1",
        registrationId: "reg-1",
        amountCents: 5000,
        refundId: "re_stub_pi_test_1",
      }),
    );
  });
});
