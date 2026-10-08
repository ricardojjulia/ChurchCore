import { MantineProvider } from "@mantine/core";
import { Notifications, notifications } from "@mantine/notifications";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function renderView(shifts: MemberScheduleEntry[], hasChurchProfile = true, locale: "en" | "es" | "es-PR" = "en") {
  return render(
    <I18nProvider locale={locale}>
      <MantineProvider>
        <Notifications />
        <MemberScheduleView shifts={shifts} hasChurchProfile={hasChurchProfile} />
      </MantineProvider>
    </I18nProvider>,
  );
}

describe("MemberScheduleView", () => {
  beforeEach(() => {
    respondToShiftActionMock.mockReset();
    notifications.clean(); // the notification store is module-global, so toasts leak between tests
  });

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

  it("responds once when Confirm is tapped twice while the first is in flight (G2.1)", async () => {
    const user = userEvent.setup();
    let release: (value: { ok: boolean }) => void = () => {};
    respondToShiftActionMock.mockReturnValue(new Promise((resolve) => (release = resolve)));
    renderView([entry({ shiftId: "s-2", confirmationStatus: "pending" })]);

    const confirm = screen.getByRole("button", { name: "Confirm" });
    await user.click(confirm);
    await user.click(confirm);
    expect(respondToShiftActionMock).toHaveBeenCalledTimes(1);
    expect(respondToShiftActionMock).toHaveBeenCalledWith("s-2", "confirmed");
    release({ ok: true });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument());
  });

  it("responds once to two synchronous clicks on Confirm (latch, not state) and on the modal's Decline", async () => {
    const user = userEvent.setup();
    let release: (value: { ok: boolean }) => void = () => {};
    respondToShiftActionMock.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const { unmount } = renderView([entry({ shiftId: "s-3", confirmationStatus: "pending" })]);
    const confirm = screen.getByRole("button", { name: "Confirm" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(respondToShiftActionMock).toHaveBeenCalledTimes(1);
    release({ ok: true });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument());
    unmount();

    respondToShiftActionMock.mockClear();
    respondToShiftActionMock.mockReturnValue(new Promise((resolve) => (release = resolve)));
    renderView([entry({ shiftId: "s-4", confirmationStatus: "confirmed" })]);
    await user.click(screen.getByRole("button", { name: "Can't make it" }));
    await screen.findByRole("dialog");
    const decline = screen.getAllByRole("button", { name: "Decline" }).at(-1)!;
    fireEvent.click(decline);
    fireEvent.click(decline);
    expect(respondToShiftActionMock).toHaveBeenCalledTimes(1);
    release({ ok: true });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Can't make it" })).not.toBeInTheDocument());
  });

  it("releases the latch after a failure so the member can try again", async () => {
    respondToShiftActionMock.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
    renderView([entry({ shiftId: "s-5", confirmationStatus: "pending" })]);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(respondToShiftActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(respondToShiftActionMock).toHaveBeenCalledTimes(2));
  });

  it("marks the next pending Confirm as the primary action, else the first Can't make it (G2.1)", () => {
    const { unmount } = renderView([
      entry({ shiftId: "a", confirmationStatus: "confirmed" }),
      entry({ shiftId: "b", confirmationStatus: "pending" }),
    ]);
    expect(screen.getByRole("button", { name: "Confirm" })).toHaveAttribute("data-primary-action");
    expect(screen.getByRole("button", { name: "Can't make it" })).not.toHaveAttribute("data-primary-action");
    unmount();
    renderView([entry({ shiftId: "a", confirmationStatus: "confirmed" })]);
    expect(screen.getByRole("button", { name: "Can't make it" })).toHaveAttribute("data-primary-action");
  });

  it("offers nothing on a declined shift", () => {
    renderView([entry({ confirmationStatus: "declined" })]);
    expect(screen.queryByRole("button", { name: /Confirm|Decline|Can't make it/ })).not.toBeInTheDocument();
  });

  it("shows the service date and the shift's time range, falling back to the shift when there's no plan", () => {
    const { unmount } = renderView([entry({})]);
    expect(screen.getByText("Sunday, October 11 · 10:00 AM–12:00 PM")).toBeInTheDocument();
    unmount();
    renderView([entry({ serviceDate: "", startsAt: "2026-10-18T09:00:00+00:00", endsAt: "2026-10-18T11:00:00+00:00" })]);
    expect(screen.getByText("Sunday, October 18 · 9:00 AM–11:00 AM")).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });

  it("says plainly when a response can't be saved because the shift isn't theirs", async () => {
    const user = userEvent.setup();
    respondToShiftActionMock.mockResolvedValue({ ok: false, code: "not_assigned", error: "server text" });
    renderView([entry({})]);
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("That shift isn't yours to answer, or it has already happened.")).toBeInTheDocument();
    expect(screen.queryByText("server text")).not.toBeInTheDocument();
  });

  it("explains when the person has no profile in this church", () => {
    renderView([], false);
    expect(
      screen.getByText("You're viewing this church without a member profile, so personal actions aren't available here."),
    ).toBeInTheDocument();
  });
});

