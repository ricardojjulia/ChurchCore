import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemberEventRegistrationPanel } from "@/components/application/member-event-registration-panel";

const { memberRegisterForEventActionMock } = vi.hoisted(() => ({
  memberRegisterForEventActionMock: vi.fn(),
}));

vi.mock("@/app/app/member-actions", () => ({
  memberRegisterForEventAction: memberRegisterForEventActionMock,
}));

describe("MemberEventRegistrationPanel", () => {
  beforeEach(() => {
    memberRegisterForEventActionMock.mockReset();
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

  it("shows payment-ready checkout state for paid registrations", async () => {
    memberRegisterForEventActionMock.mockResolvedValue({
      ok: true,
      status: "confirmed",
      paymentIntentId: "pi_member_registration_1",
      paymentClientSecret: "client_secret_hidden",
    });

    renderPanel({
      options: [
        {
          ...baseOptions[0],
          priceCents: 2500,
          currency: "usd",
          fields: [],
        },
      ] as never,
    });

    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(screen.getByText(/Payment required: \$25.00/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Submit registration" }));

    expect(await screen.findByText("Secure payment ready")).toBeInTheDocument();
    expect(screen.getByText(/Complete \$25.00 through the secure Stripe payment step/)).toBeInTheDocument();
    expect(screen.getByText("Payment intent: pi_member_registration_1")).toBeInTheDocument();
    expect(screen.queryByText("client_secret_hidden")).not.toBeInTheDocument();
  });
});
