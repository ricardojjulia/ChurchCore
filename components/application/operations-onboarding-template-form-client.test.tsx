import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  createOnboardingTemplateActionMock,
  updateOnboardingTemplateActionMock,
  useRouterMock,
} = vi.hoisted(() => ({
  createOnboardingTemplateActionMock: vi.fn(),
  updateOnboardingTemplateActionMock: vi.fn(),
  useRouterMock: { push: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => useRouterMock,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/app/app/church-admin/operations/actions", () => ({
  createOnboardingTemplateAction: createOnboardingTemplateActionMock,
  updateOnboardingTemplateAction: updateOnboardingTemplateActionMock,
}));

vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div data-testid="app-shell">{children}</div>,
}));

import { OperationsOnboardingTemplateFormClient } from "@/components/application/operations-onboarding-template-form-client";
import type { AuthSession } from "@/lib/auth";
import type { OnboardingTemplate, OnboardingTemplateStep } from "@/lib/operations-types";

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

function renderForm(props: {
  initialValues?: { template: OnboardingTemplate; steps: OnboardingTemplateStep[] };
}) {
  return render(
    <MantineProvider>
      <OperationsOnboardingTemplateFormClient
        session={buildSession()}
        {...props}
      />
    </MantineProvider>,
  );
}

const baseTemplate: OnboardingTemplate = {
  id: "tmpl-1",
  churchId: "church-1",
  name: "New Member Track",
  createdBy: "profile-1",
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const baseSteps: OnboardingTemplateStep[] = [
  {
    id: "step-1",
    churchId: "church-1",
    templateId: "tmpl-1",
    sortOrder: 0,
    title: "Welcome call",
    description: null,
    assigneeType: "staff",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "step-2",
    churchId: "church-1",
    templateId: "tmpl-1",
    sortOrder: 1,
    title: "Complete profile",
    description: null,
    assigneeType: "new_member",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

// ── Tests ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// AC14: Add step
describe("OperationsOnboardingTemplateFormClient — create mode", () => {
  it("renders with one empty step by default", () => {
    renderForm({});

    // Step 1 label
    expect(screen.getByText("Step 1")).toBeInTheDocument();
    // No Step 2 yet
    expect(screen.queryByText("Step 2")).not.toBeInTheDocument();
  });

  it("adds a new step when 'Add step' is clicked (AC14)", async () => {
    renderForm({});

    fireEvent.click(screen.getByRole("button", { name: /add step/i }));

    await waitFor(() => {
      expect(screen.getByText("Step 2")).toBeInTheDocument();
    });
  });

  it("adds multiple steps sequentially (AC14)", async () => {
    renderForm({});

    fireEvent.click(screen.getByRole("button", { name: /add step/i }));
    fireEvent.click(screen.getByRole("button", { name: /add step/i }));

    await waitFor(() => {
      expect(screen.getByText("Step 3")).toBeInTheDocument();
    });
  });

  // AC15: Remove step
  it("remove step button is disabled when only one step remains (AC15)", () => {
    renderForm({});

    const removeButtons = screen.getAllByRole("button", { name: /remove step/i });
    expect(removeButtons).toHaveLength(1);
    expect(removeButtons[0]).toBeDisabled();
  });

  it("removes a step when Remove is clicked (AC15)", async () => {
    renderForm({});

    // Add a second step first
    fireEvent.click(screen.getByRole("button", { name: /add step/i }));
    await waitFor(() => expect(screen.getByText("Step 2")).toBeInTheDocument());

    // Remove buttons are now enabled
    const removeButtons = screen.getAllByRole("button", { name: /remove step/i });
    fireEvent.click(removeButtons[1]); // remove step 2

    await waitFor(() => {
      expect(screen.queryByText("Step 2")).not.toBeInTheDocument();
    });
  });

  // AC15: Reorder — up/down
  it("up button is disabled for first step (AC15)", async () => {
    renderForm({});

    // Add a second step to enable navigation buttons
    fireEvent.click(screen.getByRole("button", { name: /add step/i }));

    await waitFor(() => {
      const upButtons = screen.getAllByRole("button", { name: /move step up/i });
      expect(upButtons[0]).toBeDisabled();
    });
  });

  it("down button is disabled for last step (AC15)", async () => {
    renderForm({});

    fireEvent.click(screen.getByRole("button", { name: /add step/i }));

    await waitFor(() => {
      const downButtons = screen.getAllByRole("button", { name: /move step down/i });
      expect(downButtons[downButtons.length - 1]).toBeDisabled();
    });
  });

  it("reorders steps: clicking 'Move step down' on step 1 swaps with step 2 (AC15)", async () => {
    renderForm({});

    // Add step 2
    fireEvent.click(screen.getByRole("button", { name: /add step/i }));
    await waitFor(() => expect(screen.getByText("Step 2")).toBeInTheDocument());

    // Fill titles so we can distinguish them
    const titleInputs = screen.getAllByRole("textbox", { name: /^title$/i });
    fireEvent.change(titleInputs[0], { target: { value: "Alpha" } });
    fireEvent.change(titleInputs[1], { target: { value: "Beta" } });

    // Move first step down
    const downButtons = screen.getAllByRole("button", { name: /move step down/i });
    fireEvent.click(downButtons[0]);

    await waitFor(() => {
      // After swap, what was step 2 (Beta) should now be Step 1 label row
      const updatedTitleInputs = screen.getAllByRole("textbox", { name: /^title$/i });
      // First field should now contain "Beta" (was second, moved up)
      expect(updatedTitleInputs[0]).toHaveValue("Beta");
      expect(updatedTitleInputs[1]).toHaveValue("Alpha");
    });
  });

  it("reorders steps: clicking 'Move step up' on step 2 swaps with step 1 (AC15)", async () => {
    renderForm({});

    fireEvent.click(screen.getByRole("button", { name: /add step/i }));
    await waitFor(() => expect(screen.getByText("Step 2")).toBeInTheDocument());

    const titleInputs = screen.getAllByRole("textbox", { name: /^title$/i });
    fireEvent.change(titleInputs[0], { target: { value: "First" } });
    fireEvent.change(titleInputs[1], { target: { value: "Second" } });

    const upButtons = screen.getAllByRole("button", { name: /move step up/i });
    fireEvent.click(upButtons[1]); // move step 2 up

    await waitFor(() => {
      const updatedInputs = screen.getAllByRole("textbox", { name: /^title$/i });
      expect(updatedInputs[0]).toHaveValue("Second");
      expect(updatedInputs[1]).toHaveValue("First");
    });
  });

  // AC14: Template name required validation
  it("shows name validation error when template name is empty on submit", async () => {
    renderForm({});

    // Fill step title to avoid step validation
    const titleInputs = screen.getAllByRole("textbox", { name: /^title$/i });
    fireEvent.change(titleInputs[0], { target: { value: "Step One" } });

    // Submit via form element — Mantine Button type="submit" may not bubble in jsdom
    const nameInput = screen.getByRole("textbox", { name: /template name/i });
    const form = nameInput.closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("Template name is required.")).toBeInTheDocument();
    });
    expect(createOnboardingTemplateActionMock).not.toHaveBeenCalled();
  });

  it("shows step title validation error when a step has no title", async () => {
    renderForm({});

    fireEvent.change(screen.getByRole("textbox", { name: /template name/i }), {
      target: { value: "My Template" },
    });
    // leave step title empty

    const nameInput = screen.getByRole("textbox", { name: /template name/i });
    const form = nameInput.closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("Step title is required.")).toBeInTheDocument();
    });
    expect(createOnboardingTemplateActionMock).not.toHaveBeenCalled();
  });

  it("calls createOnboardingTemplateAction with correct payload on valid submit", async () => {
    createOnboardingTemplateActionMock.mockResolvedValue({
      ok: true,
      id: "tmpl-new",
    });
    renderForm({});

    fireEvent.change(screen.getByRole("textbox", { name: /template name/i }), {
      target: { value: "New Member Onboarding" },
    });

    const titleInputs = screen.getAllByRole("textbox", { name: /^title$/i });
    fireEvent.change(titleInputs[0], { target: { value: "Welcome call" } });

    fireEvent.click(screen.getByRole("button", { name: /create template/i }));

    await waitFor(() => {
      expect(createOnboardingTemplateActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Member Onboarding",
          steps: expect.arrayContaining([
            expect.objectContaining({ title: "Welcome call" }),
          ]),
        }),
      );
    });
    await waitFor(() => {
      expect(useRouterMock.push).toHaveBeenCalledWith(
        "/app/church-admin/operations/onboarding",
      );
    });
  });
});

// AC15: Edit mode — existing instances unaffected (server-side concern; client shows the form)
describe("OperationsOnboardingTemplateFormClient — edit mode", () => {
  it("renders with pre-filled template name and steps in edit mode", () => {
    renderForm({ initialValues: { template: baseTemplate, steps: baseSteps } });

    expect(screen.getByDisplayValue("New Member Track")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Welcome call")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Complete profile")).toBeInTheDocument();
  });

  it("renders 'Save changes' button in edit mode", () => {
    renderForm({ initialValues: { template: baseTemplate, steps: baseSteps } });

    expect(
      screen.getByRole("button", { name: /save changes/i }),
    ).toBeInTheDocument();
  });

  it("calls updateOnboardingTemplateAction on save", async () => {
    updateOnboardingTemplateActionMock.mockResolvedValue({ ok: true });
    renderForm({ initialValues: { template: baseTemplate, steps: baseSteps } });

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(updateOnboardingTemplateActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "tmpl-1",
          name: "New Member Track",
        }),
      );
    });
  });

  it("does not call createOnboardingTemplateAction in edit mode", async () => {
    updateOnboardingTemplateActionMock.mockResolvedValue({ ok: true });
    renderForm({ initialValues: { template: baseTemplate, steps: baseSteps } });

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(updateOnboardingTemplateActionMock).toHaveBeenCalled();
    });
    expect(createOnboardingTemplateActionMock).not.toHaveBeenCalled();
  });

  it("can add a step in edit mode (AC15)", async () => {
    renderForm({ initialValues: { template: baseTemplate, steps: baseSteps } });

    expect(screen.getByText("Step 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add step/i }));

    await waitFor(() => {
      expect(screen.getByText("Step 3")).toBeInTheDocument();
    });
  });

  it("can remove a step in edit mode (AC15)", async () => {
    renderForm({ initialValues: { template: baseTemplate, steps: baseSteps } });

    const removeButtons = screen.getAllByRole("button", { name: /remove step/i });
    fireEvent.click(removeButtons[1]); // remove step 2

    await waitFor(() => {
      expect(screen.queryByDisplayValue("Complete profile")).not.toBeInTheDocument();
    });
  });
});
