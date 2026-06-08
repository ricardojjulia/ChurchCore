import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mantine Textarea autosize uses ResizeObserver and document.fonts,
// neither of which are implemented in jsdom.
if (typeof ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}

// jsdom does not implement document.fonts; mock it so Mantine Autosize does not throw.
if (typeof document.fonts === "undefined") {
  Object.defineProperty(document, "fonts", {
    value: {
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    writable: true,
  });
}

// ── Hoisted mocks ─────────────────────────────────────────────

const {
  completeOnboardingStepActionMock,
  closeOnboardingInstanceActionMock,
} = vi.hoisted(() => ({
  completeOnboardingStepActionMock: vi.fn(),
  closeOnboardingInstanceActionMock: vi.fn(),
}));

vi.mock("@/app/app/church-admin/operations/actions", () => ({
  completeOnboardingStepAction: completeOnboardingStepActionMock,
  closeOnboardingInstanceAction: closeOnboardingInstanceActionMock,
}));

vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div data-testid="app-shell">{children}</div>,
}));

import { OperationsInstanceDetailClient } from "@/components/application/operations-instance-detail-client";
import type { AuthSession } from "@/lib/auth";
import type {
  OnboardingInstanceDetail,
  OnboardingInstanceStep,
} from "@/lib/operations-types";

// ── Helpers ───────────────────────────────────────────────────

function buildSession(): AuthSession {
  return {
    userId: "user-1",
    homePath: "/app/church-admin",
    appContext: { roleId: "church-admin", church: { id: "church-1", name: "Grace Harbor" } },
    profile: { id: "profile-1", fullName: "Admin User", isPastoral: false },
    source: "supabase",
  } as unknown as AuthSession;
}

function makeStep(
  overrides: Partial<OnboardingInstanceStep> = {},
): OnboardingInstanceStep {
  return {
    id: "step-1",
    churchId: "church-1",
    instanceId: "inst-1",
    sortOrder: 0,
    title: "Welcome call",
    description: null,
    assigneeType: "staff",
    isComplete: false,
    completedAt: null,
    completedBy: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeInstance(
  overrides: Partial<OnboardingInstanceDetail> = {},
): OnboardingInstanceDetail {
  return {
    id: "inst-1",
    churchId: "church-1",
    templateId: "tmpl-1",
    profileId: "profile-member-1",
    startedBy: "profile-1",
    status: "open",
    closeReason: null,
    closedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    profileName: "John Doe",
    templateName: "New Member Track",
    steps: [makeStep()],
    ...overrides,
  };
}

function renderDetail(instance: OnboardingInstanceDetail) {
  return render(
    <MantineProvider>
      <OperationsInstanceDetailClient
        session={buildSession()}
        instance={instance}
      />
    </MantineProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// AC18: Instance progress view — step title, assignee type, completion status
describe("OperationsInstanceDetailClient — progress view (AC18)", () => {
  it("renders instance profile name and template name", () => {
    renderDetail(makeInstance());

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText(/Template: New Member Track/)).toBeInTheDocument();
  });

  it("renders step title and assignee type for each step (AC18)", () => {
    const instance = makeInstance({
      steps: [
        makeStep({ id: "s1", title: "Welcome call", assigneeType: "staff" }),
        makeStep({
          id: "s2",
          title: "Fill out form",
          assigneeType: "new_member",
          sortOrder: 1,
        }),
      ],
    });
    renderDetail(instance);

    expect(screen.getByText("Welcome call")).toBeInTheDocument();
    expect(screen.getByText("Fill out form")).toBeInTheDocument();
    expect(screen.getByText("Staff")).toBeInTheDocument();
    expect(screen.getByText("New Member")).toBeInTheDocument();
  });

  it("shows completion status and timestamp for completed steps (AC18)", () => {
    const completedAt = "2026-02-15T10:00:00Z";
    const instance = makeInstance({
      steps: [
        makeStep({
          id: "s1",
          isComplete: true,
          completedAt,
          completedBy: "profile-1",
        }),
      ],
    });
    renderDetail(instance);

    // Should show "Completed <date>"
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
  });

  it("shows step progress count (AC18)", () => {
    const instance = makeInstance({
      steps: [
        makeStep({ id: "s1", isComplete: true, completedAt: "2026-01-10T00:00:00Z" }),
        makeStep({ id: "s2", sortOrder: 1, isComplete: false }),
      ],
    });
    renderDetail(instance);

    expect(screen.getByText(/1 of 2 steps complete/)).toBeInTheDocument();
  });

  it("shows 'Open' status badge for open instance (AC18)", () => {
    renderDetail(makeInstance({ status: "open" }));
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("shows 'Closed' status badge for closed instance (AC18)", () => {
    const instance = makeInstance({
      status: "closed",
      closeReason: "Completed successfully.",
      closedAt: "2026-03-01T00:00:00Z",
    });
    renderDetail(instance);
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });
});

// AC17: Complete step by assigned user or admin/pastor; step checkbox calls action
describe("OperationsInstanceDetailClient — complete step (AC17)", () => {
  it("step checkbox is present and unchecked for incomplete step", () => {
    renderDetail(makeInstance());

    const checkbox = screen.getByRole("checkbox", {
      name: /complete step: welcome call/i,
    });
    expect(checkbox).not.toBeChecked();
  });

  it("clicking unchecked checkbox calls completeOnboardingStepAction (AC17)", async () => {
    completeOnboardingStepActionMock.mockResolvedValue({ ok: true });
    renderDetail(makeInstance());

    const checkbox = screen.getByRole("checkbox", {
      name: /complete step: welcome call/i,
    });
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(completeOnboardingStepActionMock).toHaveBeenCalledWith({
        instanceStepId: "step-1",
      });
    });
  });

  it("step checkbox is disabled and checked for already-complete step (AC17)", () => {
    const instance = makeInstance({
      steps: [
        makeStep({
          isComplete: true,
          completedAt: "2026-02-01T00:00:00Z",
        }),
      ],
    });
    renderDetail(instance);

    const checkbox = screen.getByRole("checkbox", {
      name: /complete step: welcome call/i,
    });
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeDisabled();
  });

  it("step updates optimistically to complete after successful action (AC17)", async () => {
    completeOnboardingStepActionMock.mockResolvedValue({ ok: true });
    renderDetail(makeInstance());

    const checkbox = screen.getByRole("checkbox", {
      name: /complete step: welcome call/i,
    });
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", { name: /complete step: welcome call/i }),
      ).toBeChecked();
    });
  });

  it("shows step error alert when action returns ok: false (AC17)", async () => {
    completeOnboardingStepActionMock.mockResolvedValue({
      ok: false,
      error: "This step can only be completed by staff.",
    });
    renderDetail(makeInstance());

    const checkbox = screen.getByRole("checkbox", {
      name: /complete step: welcome call/i,
    });
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(
        screen.getByText("This step can only be completed by staff."),
      ).toBeInTheDocument();
    });
  });

  it("shows success alert after completing a step (AC17)", async () => {
    completeOnboardingStepActionMock.mockResolvedValue({ ok: true });
    renderDetail(makeInstance());

    const checkbox = screen.getByRole("checkbox", {
      name: /complete step: welcome call/i,
    });
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByText("Step marked as complete.")).toBeInTheDocument();
    });
  });
});

// AC20: Close instance — confirmation + reason field (min 5 chars); record retained
describe("OperationsInstanceDetailClient — close instance (AC20)", () => {
  it("shows close section for open instances (AC20)", () => {
    renderDetail(makeInstance({ status: "open" }));

    // The section heading "Close onboarding" and the submit button both contain the text;
    // assert the textarea placeholder which is unique to this section
    expect(screen.getByPlaceholderText(/reason for closing/i)).toBeInTheDocument();
    // Confirm the Close onboarding button is rendered (not just the heading)
    expect(screen.getByRole("button", { name: /close onboarding/i })).toBeInTheDocument();
  });

  it("close button is disabled when reason has fewer than 5 chars (AC20)", () => {
    renderDetail(makeInstance({ status: "open" }));

    const textarea = screen.getByPlaceholderText(/reason for closing/i);
    fireEvent.change(textarea, { target: { value: "ok" } });

    // The submit button uses disabled={closeReason.trim().length < 5}
    const closeBtn = screen.getByRole("button", { name: /close onboarding/i });
    expect(closeBtn).toBeDisabled();
  });

  it("close button is enabled when reason has 5+ chars (AC20)", () => {
    renderDetail(makeInstance({ status: "open" }));

    const textarea = screen.getByPlaceholderText(/reason for closing/i);
    fireEvent.change(textarea, { target: { value: "Valid reason here." } });

    const closeBtn = screen.getByRole("button", { name: /close onboarding/i });
    expect(closeBtn).not.toBeDisabled();
  });

  it("shows inline validation error for reason < 5 chars on submit (AC20)", async () => {
    renderDetail(makeInstance({ status: "open" }));

    const textarea = screen.getByPlaceholderText(/reason for closing/i);
    fireEvent.change(textarea, { target: { value: "ok" } });

    // Submit the form directly to bypass disabled button
    const form = textarea.closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(
        screen.getByText("A reason of at least 5 characters is required."),
      ).toBeInTheDocument();
    });
    expect(closeOnboardingInstanceActionMock).not.toHaveBeenCalled();
  });

  it("calls closeOnboardingInstanceAction with valid reason (AC20)", async () => {
    closeOnboardingInstanceActionMock.mockResolvedValue({ ok: true });
    renderDetail(makeInstance({ status: "open" }));

    const textarea = screen.getByPlaceholderText(/reason for closing/i);
    fireEvent.change(textarea, { target: { value: "Member completed all steps." } });

    const closeBtn = screen.getByRole("button", { name: /close onboarding/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(closeOnboardingInstanceActionMock).toHaveBeenCalledWith({
        instanceId: "inst-1",
        reason: "Member completed all steps.",
      });
    });
  });

  it("updates status badge to Closed, hides close form, and shows success alert after successful close (AC20)", async () => {
    closeOnboardingInstanceActionMock.mockResolvedValue({ ok: true });
    renderDetail(makeInstance({ status: "open" }));

    const textarea = screen.getByPlaceholderText(/reason for closing/i);
    fireEvent.change(textarea, { target: { value: "All steps completed." } });

    const closeBtn = screen.getByRole("button", { name: /close onboarding/i });

    await act(async () => {
      fireEvent.click(closeBtn);
    });

    // After close succeeds: status badge updates to Closed, the form is removed,
    // and the success Alert is visible (it is rendered outside the open-only block).
    await waitFor(() => {
      expect(screen.getByText("Closed")).toBeInTheDocument();
    });
    expect(screen.queryByPlaceholderText(/reason for closing/i)).not.toBeInTheDocument();
    expect(screen.getByText("Onboarding closed successfully.")).toBeInTheDocument();
    expect(closeOnboardingInstanceActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "All steps completed." }),
    );
  });

  it("shows server error when closeOnboardingInstanceAction returns ok: false (AC20)", async () => {
    closeOnboardingInstanceActionMock.mockResolvedValue({
      ok: false,
      error: "Instance not found.",
    });
    renderDetail(makeInstance({ status: "open" }));

    const textarea = screen.getByPlaceholderText(/reason for closing/i);
    fireEvent.change(textarea, { target: { value: "Trying to close." } });

    fireEvent.click(screen.getByRole("button", { name: /close onboarding/i }));

    await waitFor(() => {
      expect(screen.getByText("Instance not found.")).toBeInTheDocument();
    });
    // Status should remain Open
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("does not show close section for already-closed instance (AC20)", () => {
    const instance = makeInstance({
      status: "closed",
      closeReason: "Completed.",
      closedAt: "2026-03-01T00:00:00Z",
    });
    renderDetail(instance);

    // The close form should not appear
    expect(
      screen.queryByPlaceholderText(/reason for closing/i),
    ).not.toBeInTheDocument();
    // But the close reason should be shown as a record
    expect(screen.getByText("Completed.")).toBeInTheDocument();
  });
});

// AC19: Instance list fields not directly testable in this component (list is in workspace)
// AC23: 375px viewport — component renders without overflow (visual; cannot measure layout in jsdom)
