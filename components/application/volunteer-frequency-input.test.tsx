import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateVolunteerFrequencyActionMock } = vi.hoisted(() => ({
  updateVolunteerFrequencyActionMock: vi.fn(),
}));

vi.mock("@/app/app/volunteer-actions", () => ({
  updateVolunteerFrequencyAction: updateVolunteerFrequencyActionMock,
}));

import { VolunteerFrequencyInput } from "@/components/application/volunteer-frequency-input";

function renderInput(initialValue: number | null) {
  return render(
    <MantineProvider>
      <VolunteerFrequencyInput profileId="p-1" fullName="Grace Adeyemi" initialValue={initialValue} />
    </MantineProvider>,
  );
}

describe("VolunteerFrequencyInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows no save button until the value changes", () => {
    renderInput(2);
    expect(screen.getByRole("textbox", { name: "Monthly limit for Grace Adeyemi" })).toHaveValue("2");
    expect(screen.queryByRole("button", { name: "Save monthly limit for Grace Adeyemi" })).not.toBeInTheDocument();
  });

  it("saves a new limit", async () => {
    const user = userEvent.setup();
    updateVolunteerFrequencyActionMock.mockResolvedValue({ ok: true });
    renderInput(null);

    await user.type(screen.getByRole("textbox", { name: "Monthly limit for Grace Adeyemi" }), "3");
    await user.click(screen.getByRole("button", { name: "Save monthly limit for Grace Adeyemi" }));

    expect(updateVolunteerFrequencyActionMock).toHaveBeenCalledWith({ profileId: "p-1", maxServicesPerMonth: 3 });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Save monthly limit for Grace Adeyemi" })).not.toBeInTheDocument(),
    );
  });

  it("clearing the field saves 'no limit' (null)", async () => {
    const user = userEvent.setup();
    updateVolunteerFrequencyActionMock.mockResolvedValue({ ok: true });
    renderInput(2);

    await user.clear(screen.getByRole("textbox", { name: "Monthly limit for Grace Adeyemi" }));
    await user.click(screen.getByRole("button", { name: "Save monthly limit for Grace Adeyemi" }));

    expect(updateVolunteerFrequencyActionMock).toHaveBeenCalledWith({ profileId: "p-1", maxServicesPerMonth: null });
  });

  it("shows the server's error and keeps the save button", async () => {
    const user = userEvent.setup();
    updateVolunteerFrequencyActionMock.mockResolvedValue({ ok: false, error: "Volunteer not found." });
    renderInput(null);

    await user.type(screen.getByRole("textbox", { name: "Monthly limit for Grace Adeyemi" }), "4");
    await user.click(screen.getByRole("button", { name: "Save monthly limit for Grace Adeyemi" }));

    expect(await screen.findByText("Volunteer not found.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save monthly limit for Grace Adeyemi" })).toBeInTheDocument();
  });
});
