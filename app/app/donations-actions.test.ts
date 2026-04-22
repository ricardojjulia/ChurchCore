import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  createPaymentIntentMock,
  createOrGetStripeCustomerMock,
  cancelStripeSubscriptionMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  sendEmailMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const createPaymentIntent = vi.fn();
  const createOrGetStripeCustomer = vi.fn();
  const cancelStripeSubscription = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();
  const sendEmail = vi.fn();

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    createPaymentIntentMock: createPaymentIntent,
    createOrGetStripeCustomerMock: createOrGetStripeCustomer,
    cancelStripeSubscriptionMock: cancelStripeSubscription,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    sendEmailMock: sendEmail,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/stripe/donations", () => ({
  createPaymentIntent: createPaymentIntentMock,
  createOrGetStripeCustomer: createOrGetStripeCustomerMock,
  cancelStripeSubscription: cancelStripeSubscriptionMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: vi.fn(),
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

vi.mock("@/lib/notifications/send-email", () => ({
  sendEmail: sendEmailMock,
}));

import {
  cancelRecurringDonationAction,
  confirmDonationAction,
  initiateDonationAction,
} from "@/app/app/donations-actions";

describe("donations actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { church: { id: "church-1", name: "Grace Church" } },
      profile: { id: "profile-1" },
      userId: "user-1",
    });
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    createPaymentIntentMock.mockResolvedValue({
      clientSecret: "pi_secret",
      paymentIntentId: "pi_123",
      isStub: false,
    });
    createOrGetStripeCustomerMock.mockResolvedValue("cus_123");
    queryTenantLocalDbMock.mockResolvedValue({ rows: [] });
  });

  it("creates anonymous donation without linking donor identity", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [{ id: "donation-1" }] });

    const result = await initiateDonationAction({
      amountCents: 2500,
      isAnonymous: true,
      donorEmail: "member@example.com",
      donorName: "Member Name",
      fundDesignation: "General",
    });

    expect(result).toEqual({
      clientSecret: "pi_secret",
      donationId: "donation-1",
      isStub: false,
    });
    expect(createOrGetStripeCustomerMock).not.toHaveBeenCalled();
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.donations"),
      [
        "church-1",
        null,
        null,
        null,
        2500,
        "General",
        "pi_123",
        null,
        true,
        null,
      ],
    );
  });

  it("creates stripe customer for non-anonymous donor email", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [{ id: "donation-2" }] });

    await initiateDonationAction({
      amountCents: 5000,
      isAnonymous: false,
      donorEmail: "member@example.com",
      donorName: "Member Name",
    });

    expect(createOrGetStripeCustomerMock).toHaveBeenCalledWith({
      email: "member@example.com",
      name: "Member Name",
      churchId: "church-1",
    });
    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCustomerId: "cus_123",
        donorEmail: "member@example.com",
      }),
    );
  });

  it("marks donation succeeded and sends receipt when donor email exists", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            donor_email: "member@example.com",
            donor_name: "Member Name",
            amount_cents: 5000,
            fund_designation: "General",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    await confirmDonationAction("donation-1", "pi_123");

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "member@example.com",
        idempotencyKey: "donation-1",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/member/giving");
  });

  it("cancels recurring donation subscription when one exists", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ stripe_subscription_id: "sub_123" }] })
      .mockResolvedValueOnce({ rows: [] });

    await cancelRecurringDonationAction("donation-1");

    expect(cancelStripeSubscriptionMock).toHaveBeenCalledWith("sub_123");
    expect(queryTenantLocalDbMock).toHaveBeenLastCalledWith(
      expect.stringContaining("update public.donations set status = 'cancelled'"),
      ["donation-1"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/member/giving");
  });

  it("skips stripe cancellation when no subscription id is present", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ stripe_subscription_id: null }] })
      .mockResolvedValueOnce({ rows: [] });

    await cancelRecurringDonationAction("donation-1");

    expect(cancelStripeSubscriptionMock).not.toHaveBeenCalled();
  });
});
