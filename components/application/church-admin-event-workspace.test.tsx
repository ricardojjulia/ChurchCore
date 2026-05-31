import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EventRegistrationsPanel } from "@/components/application/church-admin-event-workspace";

const {
  approveRegistrationActionMock,
  cancelRegistrationActionMock,
  checkInRegistrantActionMock,
  registerForEventActionMock,
  updateRegistrationPaymentFollowUpActionMock,
  upsertRegistrationFormFieldsActionMock,
  upsertRegistrationSettingsActionMock,
} = vi.hoisted(() => ({
  approveRegistrationActionMock: vi.fn(),
  cancelRegistrationActionMock: vi.fn(),
  checkInRegistrantActionMock: vi.fn(),
  registerForEventActionMock: vi.fn(),
  updateRegistrationPaymentFollowUpActionMock: vi.fn(),
  upsertRegistrationFormFieldsActionMock: vi.fn(),
  upsertRegistrationSettingsActionMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/app/church-admin-actions", () => ({
  approveRegistrationAction: approveRegistrationActionMock,
  cancelRegistrationAction: cancelRegistrationActionMock,
  checkInRegistrantAction: checkInRegistrantActionMock,
  createEventAction: vi.fn(),
  quickAddVisitorCheckInAction: vi.fn(),
  quickCheckInEventMemberAction: vi.fn(),
  registerForEventAction: registerForEventActionMock,
  removeRosterAssignmentAction: vi.fn(),
  toggleRosterConfirmationAction: vi.fn(),
  updateRegistrationPaymentFollowUpAction: updateRegistrationPaymentFollowUpActionMock,
  upsertRegistrationFormFieldsAction: upsertRegistrationFormFieldsActionMock,
  upsertRegistrationSettingsAction: upsertRegistrationSettingsActionMock,
}));

describe("EventRegistrationsPanel payment follow-up", () => {
  beforeEach(() => {
    approveRegistrationActionMock.mockReset();
    cancelRegistrationActionMock.mockReset();
    checkInRegistrantActionMock.mockReset();
    registerForEventActionMock.mockReset();
    updateRegistrationPaymentFollowUpActionMock.mockReset();
    upsertRegistrationFormFieldsActionMock.mockReset();
    upsertRegistrationSettingsActionMock.mockReset();
  });

  const session = {
    profile: { id: "profile-1", fullName: "Casey Admin" },
    appContext: { church: { id: "church-1", name: "Grace Harbor" } },
  };

  const registrations = [
    {
      id: "reg-pending",
      eventId: "event-1",
      registrantName: "Jordan Pending",
      registrantEmail: "jordan@example.com",
      registrantPhone: null,
      status: "confirmed",
      isWaitlisted: false,
      paymentStatus: "pending",
      amountPaidCents: 0,
      stripePaymentIntentId: "pi_pending_123456",
      paymentFollowUpNote: null,
      paymentFollowedUpAt: null,
      paymentFollowedUpBy: null,
      customFields: null,
      notes: null,
      registeredAt: "2026-05-30T12:00:00.000Z",
      checkedInAt: null,
    },
    {
      id: "reg-paid",
      eventId: "event-1",
      registrantName: "Pat Paid",
      registrantEmail: "pat@example.com",
      registrantPhone: null,
      status: "confirmed",
      isWaitlisted: false,
      paymentStatus: "paid",
      amountPaidCents: 2500,
      stripePaymentIntentId: "pi_paid_123456",
      paymentFollowUpNote: "Matched in Stripe.",
      paymentFollowedUpAt: "2026-05-31T10:00:00.000Z",
      paymentFollowedUpBy: "Finance Lead",
      customFields: null,
      notes: null,
      registeredAt: "2026-05-30T13:00:00.000Z",
      checkedInAt: null,
    },
  ];

  function renderPanel() {
    return render(
      <MantineProvider>
        <EventRegistrationsPanel
          session={session as never}
          eventId="event-1"
          registrations={registrations as never}
          settings={null}
          formFields={[]}
        />
      </MantineProvider>,
    );
  }

  it("shows unresolved payments and existing follow-up audit trail", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "Follow-up (1)" })).toBeInTheDocument();
    expect(screen.getByText("Resolve payment follow-up")).toBeInTheDocument();
    expect(screen.getByText("Note: Matched in Stripe.")).toBeInTheDocument();
    expect(screen.getByText(/by Finance Lead/)).toBeInTheDocument();
  });

  it("submits payment follow-up status and note", async () => {
    updateRegistrationPaymentFollowUpActionMock.mockResolvedValue({ ok: true });
    renderPanel();

    fireEvent.change(screen.getByRole("textbox", { name: /Follow-up note/i }), {
      target: { value: "Confirmed in Stripe dashboard." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save payment follow-up" }));

    await waitFor(() => {
      expect(updateRegistrationPaymentFollowUpActionMock).toHaveBeenCalledWith({
        registrationId: "reg-pending",
        eventId: "event-1",
        paymentStatus: "paid",
        note: "Confirmed in Stripe dashboard.",
      });
    });

    expect(await screen.findByText("Payment follow-up updated.")).toBeInTheDocument();
  });
});
