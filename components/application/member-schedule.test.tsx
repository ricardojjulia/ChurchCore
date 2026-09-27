import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { respondToShiftActionMock } = vi.hoisted(() => ({ respondToShiftActionMock: vi.fn() }));

vi.mock("@/app/app/volunteer-actions", () => ({ respondToShiftAction: respondToShiftActionMock }));

import { MemberScheduleView } from "@/components/application/member-schedule";
import { I18nProvider } from "@/components/i18n-provider";
import type { MemberScheduleEntry } from "@/lib/volunteer-types";

function entry(overrides: Partial<MemberScheduleEntry>): MemberScheduleEntry {
  return {
    shiftId: "s-1",
    planName: "Sunday Worship",
    serviceDate: "2026-10-11",
    roleName: "Greeter",
    startsAt: "2026-10-11T10:00:00+00:00",
    endsAt: "2026-10-11T12:00:00+00:00",
    confirmationStatus: "pending",
    ...overrides,
  } as MemberScheduleEntry;
}

function renderView(shifts: MemberScheduleEntry[]) {
  return render(
    <I18nProvider locale="en">
      <MantineProvider>
        <Notifications />
        <MemberScheduleView shifts={shifts} />
      </MantineProvider>
    </I18nProvider>,
  );
}

describe("MemberScheduleView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers Confirm and Decline on a pending shift", () => {
    renderView([entry({ confirmationStatus: "pending" })]);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Can't make it" })).not.toBeInTheDocument();
  });

  it("lets a volunteer back out of a confirmed shift with Can't make it (Council Review 20)", async () => {
    const user = userEvent.setup();
    respondToShiftActionMock.mockResolvedValue({ ok: true });
    renderView([entry({ shiftId: "s-9", confirmationStatus: "confirmed" })]);

    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Can't make it" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(dialog.querySelector("textarea")!, "Away that weekend");
    await user.click(screen.getAllByRole("button", { name: "Decline" }).at(-1)!);

    expect(respondToShiftActionMock).toHaveBeenCalledWith("s-9", "declined", "Away that weekend");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Can't make it" })).not.toBeInTheDocument());
  });

  it("offers nothing on a declined shift", () => {
    renderView([entry({ confirmationStatus: "declined" })]);
    expect(screen.queryByRole("button", { name: /Confirm|Decline|Can't make it/ })).not.toBeInTheDocument();
  });
});
