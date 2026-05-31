import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicEventRegistrationPanel } from "@/components/portal/public-event-registration-panel";

const { submitPublicEventRegistrationActionMock } = vi.hoisted(() => ({
  submitPublicEventRegistrationActionMock: vi.fn(),
}));

vi.mock("@/app/portal/actions", () => ({
  submitPublicEventRegistrationAction: submitPublicEventRegistrationActionMock,
}));

describe("PublicEventRegistrationPanel", () => {
  beforeEach(() => {
    submitPublicEventRegistrationActionMock.mockReset();
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

  it("shows payment-ready checkout state for paid public registrations", async () => {
    submitPublicEventRegistrationActionMock.mockResolvedValue({
      ok: true,
      status: "confirmed",
      paymentIntentId: "pi_public_registration_1",
      paymentClientSecret: "public_client_secret_hidden",
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(screen.getByText(/Payment required: \$35.00/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: /Full name/i }), {
      target: { value: "Public Guest" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Email/i }), {
      target: { value: "guest@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit registration" }));

    await waitFor(() => {
      expect(submitPublicEventRegistrationActionMock).toHaveBeenCalledWith({
        churchId: "church-1",
        eventId: "event-1",
        registrantName: "Public Guest",
        registrantEmail: "guest@example.com",
        registrantPhone: null,
        notes: null,
        customFields: {},
      });
    });

    expect(await screen.findByText("Secure payment ready")).toBeInTheDocument();
    expect(screen.getByText(/Complete \$35.00 through the secure Stripe payment step/)).toBeInTheDocument();
    expect(screen.getByText("Payment intent: pi_public_registration_1")).toBeInTheDocument();
    expect(screen.queryByText("public_client_secret_hidden")).not.toBeInTheDocument();
  });
});
