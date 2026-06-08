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
  createChurchDocumentActionMock,
  updateChurchDocumentActionMock,
  useRouterMock,
} = vi.hoisted(() => ({
  createChurchDocumentActionMock: vi.fn(),
  updateChurchDocumentActionMock: vi.fn(),
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
  createChurchDocumentAction: createChurchDocumentActionMock,
  updateChurchDocumentAction: updateChurchDocumentActionMock,
}));

// ApplicationShell renders its children; mock it to keep tests focused
vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div data-testid="app-shell">{children}</div>,
}));

import { OperationsDocumentFormClient } from "@/components/application/operations-document-form-client";
import type { AuthSession } from "@/lib/auth";
import type { ChurchDocument } from "@/lib/operations-types";

// ── Helpers ───────────────────────────────────────────────────

function buildSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    userId: "user-1",
    homePath: "/app/church-admin",
    appContext: { roleId: "church-admin", church: { id: "church-1", name: "Grace Harbor" } },
    profile: { id: "profile-1", fullName: "Admin User", isPastoral: false },
    source: "supabase",
    ...overrides,
  } as unknown as AuthSession;
}

function renderForm(props: {
  isEdit?: boolean;
  initialValues?: ChurchDocument;
}) {
  return render(
    <MantineProvider>
      <OperationsDocumentFormClient session={buildSession()} {...props} />
    </MantineProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// AC4: inline validation on empty submit
describe("OperationsDocumentFormClient — create mode", () => {
  it("shows inline title error when title is empty on submit", async () => {
    renderForm({});

    // Fill body but leave title blank
    fireEvent.change(screen.getByRole("textbox", { name: /body/i }), {
      target: { value: "Some body content" },
    });

    // Submit via the form element directly to ensure handleSubmit fires
    const form = screen.getByRole("textbox", { name: /title/i }).closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("Title is required.")).toBeInTheDocument();
    });
    expect(createChurchDocumentActionMock).not.toHaveBeenCalled();
  });

  it("shows inline body error when body is empty on submit", async () => {
    renderForm({});

    fireEvent.change(screen.getByRole("textbox", { name: /title/i }), {
      target: { value: "Test Title" },
    });

    const form = screen.getByRole("textbox", { name: /title/i }).closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("Body is required.")).toBeInTheDocument();
    });
    expect(createChurchDocumentActionMock).not.toHaveBeenCalled();
  });

  it("shows both inline errors when both title and body are empty on submit", async () => {
    renderForm({});

    const form = screen.getByRole("textbox", { name: /title/i }).closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("Title is required.")).toBeInTheDocument();
      expect(screen.getByText("Body is required.")).toBeInTheDocument();
    });
    expect(createChurchDocumentActionMock).not.toHaveBeenCalled();
  });

  it("calls createChurchDocumentAction with filled values and redirects on success", async () => {
    createChurchDocumentActionMock.mockResolvedValue({ ok: true, id: "doc-new" });
    renderForm({});

    fireEvent.change(screen.getByRole("textbox", { name: /title/i }), {
      target: { value: "Vision Statement" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /body/i }), {
      target: { value: "We exist to serve the community." },
    });

    fireEvent.click(screen.getByRole("button", { name: /create document/i }));

    await waitFor(() => {
      expect(createChurchDocumentActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Vision Statement",
          body: "We exist to serve the community.",
          docType: "general",
        }),
      );
    });
    await waitFor(() => {
      expect(useRouterMock.push).toHaveBeenCalledWith(
        "/app/church-admin/operations/documents",
      );
    });
  });

  it("shows server error alert when action returns ok: false", async () => {
    createChurchDocumentActionMock.mockResolvedValue({
      ok: false,
      error: "Encryption key not configured.",
    });
    renderForm({});

    fireEvent.change(screen.getByRole("textbox", { name: /title/i }), {
      target: { value: "Council Notes" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /body/i }), {
      target: { value: "Confidential content." },
    });

    fireEvent.click(screen.getByRole("button", { name: /create document/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Encryption key not configured."),
      ).toBeInTheDocument();
    });
  });

  // AC5: Textarea only — no rich-text editor
  it("uses a plain Textarea for body, not a rich-text editor", () => {
    renderForm({});
    // Textarea renders as a <textarea> element
    const bodyField = screen.getByRole("textbox", { name: /body/i });
    expect(bodyField.tagName.toLowerCase()).toBe("textarea");
    // No contenteditable rich-text divs should be present
    expect(document.querySelectorAll("[contenteditable]")).toHaveLength(0);
  });

  // AC10: elder_council_notes warning alert
  it("shows pastoral encryption warning alert when elder_council_notes is selected", async () => {
    renderForm({});

    const typeSelect = screen.getByRole("combobox", { name: /type/i });
    fireEvent.change(typeSelect, { target: { value: "elder_council_notes" } });

    await waitFor(() => {
      expect(
        screen.getByText(/encrypted at rest/i),
      ).toBeInTheDocument();
    });
  });

  it("does not show pastoral encryption warning for general type", () => {
    renderForm({});
    expect(screen.queryByText(/encrypted at rest/i)).not.toBeInTheDocument();
  });
});

// AC6: Edit mode — type field disabled, saves via updateChurchDocumentAction
describe("OperationsDocumentFormClient — edit mode", () => {
  const existingDoc: ChurchDocument = {
    id: "doc-1",
    churchId: "church-1",
    title: "Existing Title",
    docType: "policy",
    body: "Existing body content.",
    createdBy: "profile-1",
    updatedBy: "profile-1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
  };

  it("renders in edit mode with pre-filled values", () => {
    renderForm({ isEdit: true, initialValues: existingDoc });

    expect(screen.getByDisplayValue("Existing Title")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Existing body content.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save changes/i }),
    ).toBeInTheDocument();
  });

  it("type field is disabled in edit mode (AC6)", () => {
    renderForm({ isEdit: true, initialValues: existingDoc });

    const typeSelect = screen.getByRole("combobox", { name: /type/i });
    expect(typeSelect).toBeDisabled();
  });

  it("shows 'Document type cannot be changed' description when in edit mode", () => {
    renderForm({ isEdit: true, initialValues: existingDoc });

    expect(
      screen.getByText(/document type cannot be changed/i),
    ).toBeInTheDocument();
  });

  it("calls updateChurchDocumentAction on save (AC6)", async () => {
    updateChurchDocumentActionMock.mockResolvedValue({ ok: true });
    renderForm({ isEdit: true, initialValues: existingDoc });

    fireEvent.change(screen.getByRole("textbox", { name: /title/i }), {
      target: { value: "Updated Title" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(updateChurchDocumentActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "doc-1",
          title: "Updated Title",
        }),
      );
    });
  });

  it("does not call createChurchDocumentAction in edit mode", async () => {
    updateChurchDocumentActionMock.mockResolvedValue({ ok: true });
    renderForm({ isEdit: true, initialValues: existingDoc });

    fireEvent.change(screen.getByRole("textbox", { name: /title/i }), {
      target: { value: "Changed" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(updateChurchDocumentActionMock).toHaveBeenCalled();
    });
    expect(createChurchDocumentActionMock).not.toHaveBeenCalled();
  });

  it("shows inline validation errors in edit mode too (AC4)", async () => {
    renderForm({ isEdit: true, initialValues: existingDoc });

    // Clear title
    fireEvent.change(screen.getByRole("textbox", { name: /title/i }), {
      target: { value: "" },
    });
    // Clear body
    fireEvent.change(screen.getByRole("textbox", { name: /body/i }), {
      target: { value: "" },
    });

    const form = screen.getByRole("textbox", { name: /title/i }).closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("Title is required.")).toBeInTheDocument();
      expect(screen.getByText("Body is required.")).toBeInTheDocument();
    });
    expect(updateChurchDocumentActionMock).not.toHaveBeenCalled();
  });
});
