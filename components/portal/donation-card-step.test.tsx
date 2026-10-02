import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// G3.0: the card step confirms the PaymentIntent with Stripe in the browser.
// A declined card is shown, nothing is recorded, and the member can retry;
// an accepted one is handed back with its status for the server to check.

const { confirmPaymentMock } = vi.hoisted(() => ({ confirmPaymentMock: vi.fn() }));

const { loadStripeMock } = vi.hoisted(() => ({ loadStripeMock: vi.fn(async () => ({})) }));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: loadStripeMock }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PaymentElement: () => <div>Stripe card field</div>,
  useStripe: () => ({ confirmPayment: confirmPaymentMock }),
  useElements: () => ({}),
}));

import { DonationCardStep } from "@/components/portal/donation-card-step";

function renderStep() {
  const onPaid = vi.fn();
  const onBack = vi.fn();
  const onCancel = vi.fn();
  render(
    <MantineProvider>
      <DonationCardStep
        publishableKey="pk_test_123"
        stripeAccount="acct_church1"
        clientSecret="pi_123_secret"
        amountLabel="$25.00"
        onPaid={onPaid}
        onBack={onBack}
        onCancel={onCancel}
      />
    </MantineProvider>,
  );
  return { onPaid, onBack, onCancel };
}

describe("DonationCardStep", () => {
  beforeEach(() => {
    confirmPaymentMock.mockReset();
  });

  it("loads Stripe.js on the church's connected account, where the gift is charged (ADR 0025)", () => {
    renderStep();
    expect(loadStripeMock).toHaveBeenCalledWith("pk_test_123", { stripeAccount: "acct_church1" });
  });

  it("shows a declined card's message, records nothing, and lets the member try again", async () => {
    confirmPaymentMock.mockResolvedValueOnce({ error: { type: "card_error", message: "Your card was declined." } });
    const { onPaid } = renderStep();

    fireEvent.click(screen.getByRole("button", { name: "Pay $25.00" }));

    expect(await screen.findByText("Your card was declined.")).toBeInTheDocument();
    expect(onPaid).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pay $25.00" })).toBeEnabled();

    confirmPaymentMock.mockResolvedValueOnce({ paymentIntent: { status: "succeeded" } });
    fireEvent.click(screen.getByRole("button", { name: "Pay $25.00" }));
    await waitFor(() => expect(onPaid).toHaveBeenCalledWith("succeeded"));
  });

  it("confirms without leaving the page for cards", async () => {
    confirmPaymentMock.mockResolvedValueOnce({ paymentIntent: { status: "succeeded" } });
    renderStep();

    fireEvent.click(screen.getByRole("button", { name: "Pay $25.00" }));
    await waitFor(() => expect(confirmPaymentMock).toHaveBeenCalled());
    expect(confirmPaymentMock.mock.calls[0][0]).toMatchObject({ redirect: "if_required" });
  });

  it("hands a still-processing payment back as processing", async () => {
    confirmPaymentMock.mockResolvedValueOnce({ paymentIntent: { status: "processing" } });
    const { onPaid } = renderStep();

    fireEvent.click(screen.getByRole("button", { name: "Pay $25.00" }));
    await waitFor(() => expect(onPaid).toHaveBeenCalledWith("processing"));
  });

  it("for a registration: no Back, and a cancel that says what it cancels (G3.0c)", () => {
    const onCancel = vi.fn();
    render(
      <MantineProvider>
        <DonationCardStep
          publishableKey="pk_test_123"
          stripeAccount="acct_church1"
          clientSecret="pi_123_secret"
          amountLabel="$15.00"
          onPaid={vi.fn()}
          onCancel={onCancel}
          cancelLabel="Cancel registration"
        />
      </MantineProvider>,
    );
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel registration" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
