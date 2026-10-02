import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemberEventRegistrationPanel } from "@/components/application/member-event-registration-panel";

const { memberRegisterForEventActionMock, cancelUnpaidMock, cardStepProps } = vi.hoisted(() => ({
  memberRegisterForEventActionMock: vi.fn(),
  cancelUnpaidMock: vi.fn(),
  cardStepProps: vi.fn(),
}));

vi.mock("@/app/app/member-actions", () => ({
  memberRegisterForEventAction: memberRegisterForEventActionMock,
  cancelUnpaidMemberRegistrationAction: cancelUnpaidMock,
}));

// Stripe's card form itself is tested in donation-card-step.test.tsx.
vi.mock("@/components/portal/donation-card-step", () => ({
  DonationCardStep: (props: { onPaid: (s: string) => void; onCancel: () => void }) => {
    cardStepProps(props);
    return (
      <div>
        <span>Stripe card form</span>
        <button onClick={() => props.onPaid("processing")}>Stripe processing</button>
        <button onClick={props.onCancel}>Leave card step</button>
      </div>
    );
  },
}));

describe("MemberEventRegistrationPanel", () => {
  beforeEach(() => {
    memberRegisterForEventActionMock.mockReset();
    cancelUnpaidMock.mockReset();
    cardStepProps.mockReset();
  });

  const baseOptions = [
    {
      eventId: "event-1",
      title: "Community Picnic",
      startsAt: "2099-08-01T14:00:00.000Z",
      endsAt: "2099-08-01T16:00:00.000Z",
      category: "outreach",
      priceCents: 0,
      currency: "usd",
      capacity: 100,
      registrationCount: 24,
      waitlistCount: 0,
      approvalRequired: false,
      householdRegistrationEnabled: false,
      deadline: null,
      memberRegistrationStatus: null,
      fields: [
        {
          id: "field-1",
          eventId: "event-1",
          label: "Shirt size",
          fieldKey: "shirt_size",
          fieldType: "text",
          isRequired: true,
          options: [],
          sortOrder: 1,
        },
      ],
    },
  ];

  function renderPanel(overrides?: Partial<React.ComponentProps<typeof MemberEventRegistrationPanel>>) {
    return render(
      <MantineProvider>
        <MemberEventRegistrationPanel
          churchId="church-1"
          options={baseOptions as never}
          familyMembers={[
            { id: "profile-1", fullName: "Alex Jones", relationshipLabel: "Self", isPrimary: true },
          ] as never}
          {...overrides}
        />
      </MantineProvider>,
    );
  }

  it("renders empty state when no registration options are available", () => {
    renderPanel({ options: [] as never });

    expect(screen.getByText("No open registrations are available right now.")).toBeInTheDocument();
  });

  it("shows required-field validation before submit", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit registration" }));

    expect(
      await screen.findByText("Please complete required field: Shirt size."),
    ).toBeInTheDocument();
    expect(memberRegisterForEventActionMock).not.toHaveBeenCalled();
  });

  it("submits dynamic field values and notes", async () => {
    memberRegisterForEventActionMock.mockResolvedValue({ ok: true, status: "confirmed" });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    fireEvent.change(screen.getByRole("textbox", { name: /Shirt size/i }), {
      target: { value: "M" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Notes \(optional\)/i }), {
      target: { value: "Please seat near stage" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit registration" }));

    await waitFor(() => {
      expect(memberRegisterForEventActionMock).toHaveBeenCalledWith({
        eventId: "event-1",
        targetProfileId: undefined,
        notes: "Please seat near stage",
        customFields: { shirt_size: "M" },
      });
    });

    expect(await screen.findByText("Registration confirmed.")).toBeInTheDocument();
  });

  describe("live payment: Stripe's card form (G3.0c)", () => {
    const paidOptions = [{ ...baseOptions[0], priceCents: 2500, currency: "usd", fields: [] }];

    beforeEach(() => {
      memberRegisterForEventActionMock.mockResolvedValue({
        ok: true,
        status: "confirmed",
        registrationId: "reg-member-1",
        paymentIntentId: "pi_member_1",
        paymentClientSecret: "pi_member_1_secret",
        checkout: { clientSecret: "pi_member_1_secret", publishableKey: "pk_test_1", stripeAccount: "acct_church1" },
      });
    });

    it("shows the card form on the church's account after registering, in place of the form", async () => {
      renderPanel({ options: paidOptions as never });
      fireEvent.click(screen.getByRole("button", { name: "Register" }));
      expect(screen.getByText(/Payment required: \$25.00/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Submit registration" }));

      expect(await screen.findByText("Stripe card form")).toBeInTheDocument();
      expect(cardStepProps).toHaveBeenCalledWith(
        expect.objectContaining({ publishableKey: "pk_test_1", stripeAccount: "acct_church1", clientSecret: "pi_member_1_secret" }),
      );
      expect(screen.queryByRole("button", { name: "Submit registration" })).toBeNull();
    });

    it("says a processing payment completes the registration when it clears", async () => {
      renderPanel({ options: paidOptions as never });
      fireEvent.click(screen.getByRole("button", { name: "Register" }));
      fireEvent.click(screen.getByRole("button", { name: "Submit registration" }));
      fireEvent.click(await screen.findByText("Stripe processing"));
      expect(await screen.findByText(/Your payment is processing/)).toBeInTheDocument();
    });

    it("cancels the unpaid registration when the member leaves the card step", async () => {
      cancelUnpaidMock.mockResolvedValue({ ok: true, cancelled: true });
      renderPanel({ options: paidOptions as never });
      fireEvent.click(screen.getByRole("button", { name: "Register" }));
      fireEvent.click(screen.getByRole("button", { name: "Submit registration" }));
      fireEvent.click(await screen.findByText("Leave card step"));
      expect(await screen.findByText("Registration cancelled. You weren't charged.")).toBeInTheDocument();
      expect(cancelUnpaidMock).toHaveBeenCalledWith("reg-member-1", "pi_member_1");
    });

    it("says so, and keeps the registration, when the payment went through before the cancel", async () => {
      cancelUnpaidMock.mockResolvedValue({ ok: true, cancelled: false, paymentStatus: "succeeded" });
      renderPanel({ options: paidOptions as never });
      fireEvent.click(screen.getByRole("button", { name: "Register" }));
      fireEvent.click(screen.getByRole("button", { name: "Submit registration" }));
      fireEvent.click(await screen.findByText("Leave card step"));
      expect(await screen.findByText(/^Your payment already went through, so your registration stands\./)).toBeInTheDocument();
    });

    it("keeps checkout open when Stripe couldn't cancel an unpaid payment, rather than calling it paid (PR #175 review)", async () => {
      cancelUnpaidMock.mockResolvedValue({ ok: false, cancelled: false, error: "Couldn't cancel the payment. Please try again." });
      renderPanel({ options: paidOptions as never });
      fireEvent.click(screen.getByRole("button", { name: "Register" }));
      fireEvent.click(screen.getByRole("button", { name: "Submit registration" }));
      fireEvent.click(await screen.findByText("Leave card step"));
      expect(await screen.findByText("Couldn't cancel the payment. Please try again.")).toBeInTheDocument();
      expect(screen.getByText("Stripe card form")).toBeInTheDocument();
      expect(screen.queryByText(/already went through/)).toBeNull();
    });

    it("keeps the dialog open, with the error, when the cancel on close fails (PR #175 review)", async () => {
      cancelUnpaidMock.mockRejectedValue(new Error("network"));
      renderPanel({ options: paidOptions as never });
      fireEvent.click(screen.getByRole("button", { name: "Register" }));
      fireEvent.click(screen.getByRole("button", { name: "Submit registration" }));
      await screen.findByText("Stripe card form");
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(await screen.findByText("Couldn't cancel the registration. Please try again.")).toBeInTheDocument();
      expect(screen.getByText("Stripe card form")).toBeInTheDocument();
    });
  });

  describe("demo payment (S4, PR #168 review)", () => {
    async function openDemoCheckout() {
      vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
      memberRegisterForEventActionMock.mockResolvedValue({
        ok: true,
        status: "confirmed",
        registrationId: "reg-member-1",
        paymentIntentId: "pi_event_registration_stub_reg-member-1",
        paymentClientSecret: null,
        checkout: null,
      });
      renderPanel({ options: [{ ...baseOptions[0], priceCents: 2500, currency: "usd", fields: [] }] as never });
      fireEvent.click(screen.getByRole("button", { name: "Register" }));
      fireEvent.click(screen.getByRole("button", { name: "Submit registration" }));
      return screen.findByRole("button", { name: /Complete Demo Payment/ });
    }

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it("shows an error and keeps checkout open when the route refuses", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
      fireEvent.click(await openDemoCheckout());

      expect(await screen.findByText("The demo payment couldn't be completed.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Complete Demo Payment/ })).toBeInTheDocument();
      expect(screen.queryByText(/Payment received/)).not.toBeInTheDocument();
    });

    it("confirms and closes checkout when the route completes the payment", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));
      fireEvent.click(await openDemoCheckout());

      expect(await screen.findByText("Payment received. Your registration is complete.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Complete Demo Payment/ })).toBeNull();
    });
  });
});
