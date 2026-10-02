import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PublicEventRegistrationPanel } from "@/components/portal/public-event-registration-panel";

const { submitPublicEventRegistrationActionMock, cancelUnpaidMock } = vi.hoisted(() => ({
  submitPublicEventRegistrationActionMock: vi.fn(),
  cancelUnpaidMock: vi.fn(),
}));

vi.mock("@/app/portal/actions", () => ({
  submitPublicEventRegistrationAction: submitPublicEventRegistrationActionMock,
  cancelUnpaidPublicRegistrationAction: cancelUnpaidMock,
}));

// Stripe's card form itself is tested in donation-card-step.test.tsx; here
// it's a stand-in that reports a payment or a cancel.
const { cardStepProps } = vi.hoisted(() => ({ cardStepProps: vi.fn() }));
vi.mock("@/components/portal/donation-card-step", () => ({
  DonationCardStep: (props: { onPaid: (s: string) => void; onCancel: () => void; onBack?: () => void }) => {
    cardStepProps(props);
    return (
      <div>
        <span>Stripe card form</span>
        <button onClick={() => props.onPaid("succeeded")}>Stripe paid</button>
        <button onClick={props.onCancel}>Leave card step</button>
      </div>
    );
  },
}));

describe("PublicEventRegistrationPanel", () => {
  beforeEach(() => {
    submitPublicEventRegistrationActionMock.mockReset();
    cancelUnpaidMock.mockReset();
    cardStepProps.mockReset();
  });

  const baseOptions = [
    {
      eventId: "event-1",
      title: "Retreat",
      startsAt: "2099-08-01T14:00:00.000Z",
      endsAt: "2099-08-01T16:00:00.000Z",
      category: "discipleship",
      priceCents: 3500,
      currency: "usd",
      capacity: 80,
      registrationCount: 12,
      waitlistCount: 0,
      approvalRequired: false,
      deadline: null,
      fields: [],
    },
  ];

  function renderPanel() {
    return render(
      <MantineProvider>
        <PublicEventRegistrationPanel
          churchId="church-1"
          churchName="Grace Harbor"
          options={baseOptions as never}
        />
      </MantineProvider>,
    );
  }

  const CHECKOUT = { clientSecret: "pi_public_1_secret", publishableKey: "pk_test_1", stripeAccount: "acct_church1" };

  async function registerAsGuest() {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Full name/i }), { target: { value: "Public Guest" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Email/i }), { target: { value: "guest@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit registration" }));
  }

  describe("live payment: Stripe's card form (G3.0c)", () => {
    beforeEach(() => {
      submitPublicEventRegistrationActionMock.mockResolvedValue({
        ok: true,
        status: "confirmed",
        registrationId: "reg-public-1",
        paymentIntentId: "pi_public_1",
        paymentClientSecret: CHECKOUT.clientSecret,
        checkout: CHECKOUT,
      });
    });

    it("says payment comes next, then shows the card form on the church's account in place of the form", async () => {
      renderPanel();
      fireEvent.click(screen.getByRole("button", { name: "Register" }));
      // Let the modal's own focus trap settle (it focuses on open, in a
      // timeout), as it has long before anyone finishes typing.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(screen.getByText(/Payment required: \$35.00/)).toBeInTheDocument();
      expect(screen.getByText(/pay by card right after registering/)).toBeInTheDocument();
      fireEvent.change(screen.getByRole("textbox", { name: /Full name/i }), { target: { value: "Public Guest" } });
      fireEvent.change(screen.getByRole("textbox", { name: /Email/i }), { target: { value: "guest@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Submit registration" }));

      await waitFor(() =>
        expect(submitPublicEventRegistrationActionMock).toHaveBeenCalledWith({
          churchId: "church-1",
          eventId: "event-1",
          registrantName: "Public Guest",
          registrantEmail: "guest@example.com",
          registrantPhone: null,
          notes: null,
          customFields: {},
        }),
      );
      expect(await screen.findByText("Stripe card form")).toBeInTheDocument();
      expect(screen.getByText("Pay $35.00 to complete your registration")).toBeInTheDocument();
      expect(cardStepProps).toHaveBeenCalledWith(
        expect.objectContaining({ publishableKey: "pk_test_1", stripeAccount: "acct_church1", clientSecret: "pi_public_1_secret" }),
      );
      // No Back from a registration's card step; its cancel says what it
      // cancels; and the registration form is gone, so it can't be submitted
      // twice.
      expect(cardStepProps.mock.calls[0][0].onBack).toBeUndefined();
      expect(cardStepProps.mock.calls[0][0]).toMatchObject({ cancelLabel: "Cancel registration" });
      // Before choosing, the registrant is told what closing or cancelling does,
      // and focus lands on the step that replaced the form (Council Review 36).
      expect(screen.getByText(/Closing this window, or choosing Cancel registration, cancels the registration/)).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Pay $35.00 to complete your registration" })).toHaveFocus();
      expect(screen.queryByRole("button", { name: "Submit registration" })).toBeNull();
    });

    it("confirms once Stripe has the payment", async () => {
      await registerAsGuest();
      fireEvent.click(await screen.findByText("Stripe paid"));
      expect(await screen.findByText("Payment received. Your registration is complete.")).toBeInTheDocument();
      expect(screen.queryByText("Stripe card form")).toBeNull();
      expect(cancelUnpaidMock).not.toHaveBeenCalled();
    });

    it("cancels the unpaid registration when the visitor leaves the card step", async () => {
      cancelUnpaidMock.mockResolvedValue({ ok: true, cancelled: true });
      await registerAsGuest();
      fireEvent.click(await screen.findByText("Leave card step"));
      expect(await screen.findByText("Registration cancelled. You weren't charged.")).toBeInTheDocument();
      expect(cancelUnpaidMock).toHaveBeenCalledWith("reg-public-1", "pi_public_1");
    });

    it("keeps the card step, with the error, when cancelling fails", async () => {
      cancelUnpaidMock.mockResolvedValue({ ok: false, cancelled: false, error: "Couldn't cancel the payment. Please try again." });
      await registerAsGuest();
      fireEvent.click(await screen.findByText("Leave card step"));
      expect(await screen.findByText("Couldn't cancel the payment. Please try again.")).toBeInTheDocument();
      expect(screen.getByText("Stripe card form")).toBeInTheDocument();
    });

    it("cancels the unpaid registration when the visitor closes the dialog without paying", async () => {
      cancelUnpaidMock.mockResolvedValue({ ok: true, cancelled: true });
      await registerAsGuest();
      await screen.findByText("Stripe card form");
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      await waitFor(() => expect(cancelUnpaidMock).toHaveBeenCalledWith("reg-public-1", "pi_public_1"));
      await waitFor(() => expect(screen.queryByText("Stripe card form")).toBeNull());
    });

    it("keeps the dialog and checkout open, with the error, when the cancel on close fails (PR #175 review)", async () => {
      cancelUnpaidMock.mockResolvedValue({ ok: false, cancelled: false, error: "Couldn't cancel the payment. Please try again." });
      await registerAsGuest();
      await screen.findByText("Stripe card form");
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(await screen.findByText("Couldn't cancel the payment. Please try again.")).toBeInTheDocument();
      expect(screen.getByText("Stripe card form")).toBeInTheDocument();
    });

    it("can't be closed while the registration is being submitted (PR #175 review)", async () => {
      let resolveSubmit: (value: unknown) => void = () => {};
      submitPublicEventRegistrationActionMock.mockReturnValue(new Promise((resolve) => (resolveSubmit = resolve)));
      await registerAsGuest();
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      resolveSubmit({
        ok: true,
        status: "confirmed",
        registrationId: "reg-public-1",
        paymentIntentId: "pi_public_1",
        checkout: CHECKOUT,
      });
      expect(await screen.findByText("Stripe card form")).toBeInTheDocument();
    });

    it("reports the payment and the pending approval separately (PR #175 review)", async () => {
      submitPublicEventRegistrationActionMock.mockResolvedValue({
        ok: true,
        status: "pending_approval",
        registrationId: "reg-public-1",
        paymentIntentId: "pi_public_1",
        checkout: CHECKOUT,
      });
      await registerAsGuest();
      fireEvent.click(await screen.findByText("Stripe paid"));
      expect(await screen.findByText("Payment received. Your registration is awaiting the church's approval.")).toBeInTheDocument();
      expect(screen.queryByText(/registration is complete/)).toBeNull();
    });

    it("shows the server's refusal when the church can't take payments, with no card form", async () => {
      submitPublicEventRegistrationActionMock.mockResolvedValue({
        ok: false,
        error: "This event takes payment online, but online payment isn't set up for this church yet. Please contact the church office to register.",
      });
      await registerAsGuest();
      expect(await screen.findByText(/online payment isn't set up for this church yet/)).toBeInTheDocument();
      expect(screen.queryByText("Stripe card form")).toBeNull();
    });
  });

  describe("demo payment (S4, PR #168 review)", () => {
    async function openDemoCheckout() {
      vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
      submitPublicEventRegistrationActionMock.mockResolvedValue({
        ok: true,
        status: "confirmed",
        registrationId: "reg-public-1",
        paymentIntentId: "pi_event_registration_stub_reg-public-1",
        paymentClientSecret: null,
        checkout: null,
      });
      await registerAsGuest();
      return screen.findByRole("button", { name: /Complete Demo Payment/ });
    }

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it("shows an error and keeps checkout open when the route refuses", async () => {
      const fetchMock = vi.fn(async () => ({ ok: false, status: 404 }));
      vi.stubGlobal("fetch", fetchMock);
      fireEvent.click(await openDemoCheckout());

      expect(await screen.findByText("The demo payment couldn't be completed.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Complete Demo Payment/ })).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/demo/complete-payment",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ registrationId: "reg-public-1", churchId: "church-1" }) }),
      );
    });

    it("confirms and closes checkout when the route completes the payment", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));
      fireEvent.click(await openDemoCheckout());

      expect(await screen.findByText("Payment received. Your registration is complete.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Complete Demo Payment/ })).toBeNull();
    });
  });

  describe("Council Review 33", () => {
    it("shows event times in the church's time zone, with the zone named", () => {
      render(
        <MantineProvider>
          <PublicEventRegistrationPanel
            churchId="church-1"
            churchName="Grace Harbor"
            timeZone="America/Los_Angeles"
            options={[{ ...baseOptions[0], startsAt: "2099-08-01T17:00:00.000Z" }] as never}
          />
        </MantineProvider>,
      );
      // 17:00 UTC is 10:00 AM Pacific (daylight time in August).
      expect(screen.getByText(/10:00\sAM\sPDT/)).toBeInTheDocument();
    });

    it("renders a checkbox field as a real, required checkbox", () => {
      render(
        <MantineProvider>
          <PublicEventRegistrationPanel
            churchId="church-1"
            churchName="Grace Harbor"
            options={[
              {
                ...baseOptions[0],
                priceCents: 0,
                fields: [
                  { id: "f-1", eventId: "event-1", label: "I accept the waiver", fieldKey: "waiver", fieldType: "checkbox", isRequired: true, options: [], sortOrder: 0 },
                ],
              },
            ] as never}
          />
        </MantineProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Register" }));

      const waiver = screen.getByRole("checkbox", { name: /I accept the waiver/ });
      expect(waiver).toBeRequired();
      expect(waiver).not.toBeChecked();
      fireEvent.click(waiver);
      expect(waiver).toBeChecked();
    });
  });
});

