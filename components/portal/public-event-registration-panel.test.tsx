import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
      registrationId: "reg-public-1",
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

  describe("demo payment (S4, PR #168 review)", () => {
    async function openDemoCheckout() {
      vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
      submitPublicEventRegistrationActionMock.mockResolvedValue({
        ok: true,
        status: "confirmed",
        registrationId: "reg-public-1",
        paymentIntentId: "pi_event_registration_stub_reg-public-1",
        paymentClientSecret: null,
      });
      renderPanel();
      fireEvent.click(screen.getByRole("button", { name: "Register" }));
      fireEvent.change(screen.getByRole("textbox", { name: /Full name/i }), { target: { value: "Public Guest" } });
      fireEvent.change(screen.getByRole("textbox", { name: /Email/i }), { target: { value: "guest@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Submit registration" }));
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
      expect(screen.getByText("Secure payment ready")).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith("/api/demo/complete-payment", expect.objectContaining({ method: "POST" }));
    });

    it("confirms and closes checkout when the route completes the payment", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));
      fireEvent.click(await openDemoCheckout());

      expect(await screen.findByText("Demo payment complete. Registration confirmed.")).toBeInTheDocument();
      expect(screen.queryByText("Secure payment ready")).not.toBeInTheDocument();
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

