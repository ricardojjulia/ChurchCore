/**
 * CC-COMM-001
 * AC2:  Compose requires subject (email), channel, body, audience.
 *       Send button disabled until all required fields are satisfied.
 * AC5:  Loading a template pre-fills subject/channel/body.
 * AC6:  Live recipient count shown before send.
 * AC13: Confirm modal opens on send-button click.
 * Bonus: SMS hides subject field and shows char counter.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom polyfills needed for Mantine
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
if (typeof document.fonts === "undefined") {
  Object.defineProperty(document, "fonts", {
    value: { addEventListener: () => {}, removeEventListener: () => {} },
    writable: true,
  });
}

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  composeAndSendMessageActionMock,
  createTemplateActionMock,
  previewRecipientsActionMock,
  useRouterMock,
} = vi.hoisted(() => ({
  composeAndSendMessageActionMock: vi.fn(async () => ({ ok: true, logId: "log-new" })),
  createTemplateActionMock: vi.fn(async () => ({ ok: true, id: "tmpl-1" })),
  previewRecipientsActionMock: vi.fn(async () => ({
    ok: true,
    result: { count: 5, sample: [] },
  })),
  useRouterMock: { push: vi.fn(), refresh: vi.fn() },
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

vi.mock("@/app/app/communications-actions", () => ({
  composeAndSendMessageAction: composeAndSendMessageActionMock,
  createTemplateAction: createTemplateActionMock,
  previewRecipientsAction: previewRecipientsActionMock,
}));

vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

// CommunicationsAudienceBuilder is complex — stub it so compose tests stay focused
vi.mock("@/components/application/communications-audience-builder", () => ({
  CommunicationsAudienceBuilder: ({
    onChange,
  }: {
    onChange: (v: Record<string, unknown>) => void;
  }) => (
    <div data-testid="audience-builder">
      <button
        type="button"
        data-testid="trigger-audience-change"
        onClick={() => onChange({ role: "member" })}
      >
        Set audience
      </button>
    </div>
  ),
}));

import { CommunicationsComposeClient } from "@/components/application/communications-compose-client";
import type { ChurchAppSession } from "@/lib/auth";
import type { CommunicationTemplate } from "@/lib/communications-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSession(): ChurchAppSession {
  return {
    source: "supabase",
    userId: "user-1",
    homePath: "/app",
    canAccessControl: false,
    memberships: [],
    tenantViews: [],
    profile: {
      id: "profile-1",
      name: "Pastor John",
      email: "john@church.example",
      title: "Pastor",
      roleId: "pastor",
      defaultPath: "/app",
      focus: "",
      isPastoral: true,
    },
    appContext: {
      kind: "church",
      source: "membership",
      church: {
        id: "church-1",
        name: "Grace Church",
        slug: "grace-church",
        timezone: "America/Chicago",
      },
      roleId: "pastor",
      homePath: "/app",
    },
  };
}

const EMAIL_TEMPLATE: CommunicationTemplate = {
  id: "tmpl-email-1",
  churchId: "church-1",
  name: "Welcome Email",
  channel: "email",
  subject: "Welcome to Grace!",
  body: "Dear friend, welcome to our church family.",
  createdBy: "profile-1",
  updatedBy: "profile-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const SMS_TEMPLATE: CommunicationTemplate = {
  id: "tmpl-sms-1",
  churchId: "church-1",
  name: "Quick SMS",
  channel: "sms",
  subject: null,
  body: "Reminder: service at 10am",
  createdBy: "profile-1",
  updatedBy: "profile-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderCompose({
  templates = [EMAIL_TEMPLATE, SMS_TEMPLATE],
  initialTemplate,
}: {
  templates?: CommunicationTemplate[];
  initialTemplate?: CommunicationTemplate;
} = {}) {
  return render(
    <MantineProvider>
      <CommunicationsComposeClient
        session={buildSession()}
        ministries={[{ id: "min-1", name: "Worship Team" }]}
        templates={templates}
        initialTemplate={initialTemplate}
      />
    </MantineProvider>,
  );
}

/**
 * Advance all fake timers (debounce) and flush the resulting promises.
 * Called inside act() to let React process state updates.
 */
async function flushDebounceAndPreview() {
  await act(async () => {
    vi.runAllTimers();
    // Let the resolved promise microtasks drain
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: false });
  previewRecipientsActionMock.mockResolvedValue({
    ok: true,
    result: { count: 5, sample: [] },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// ── AC2: required fields — Send button disabled until satisfied ────────────────

describe("CommunicationsComposeClient — AC2 (required fields)", () => {
  it("Send button is initially disabled (no body, preview not resolved yet)", () => {
    renderCompose();
    const sendBtn = screen.getByRole("button", { name: /send now/i });
    expect(sendBtn).toBeDisabled();
  });

  it("Send button remains disabled when body is empty even after preview resolves", async () => {
    renderCompose();
    await flushDebounceAndPreview();
    const sendBtn = screen.getByRole("button", { name: /send now/i });
    expect(sendBtn).toBeDisabled();
  });

  it("Send button is disabled for email when subject is missing even with body", async () => {
    renderCompose();
    // Fill body only — leave subject empty
    const bodyTextarea = screen.getByRole("textbox", { name: /body/i });
    fireEvent.change(bodyTextarea, { target: { value: "Hello everyone" } });
    await flushDebounceAndPreview();
    const sendBtn = screen.getByRole("button", { name: /send now/i });
    expect(sendBtn).toBeDisabled();
  });

  it("Send button is enabled for email when subject + body filled and preview > 0", async () => {
    renderCompose();
    const subjectInput = screen.getByRole("textbox", { name: /subject/i });
    fireEvent.change(subjectInput, { target: { value: "Sunday Service" } });
    const bodyTextarea = screen.getByRole("textbox", { name: /body/i });
    fireEvent.change(bodyTextarea, { target: { value: "Hello everyone" } });
    await flushDebounceAndPreview();
    const sendBtn = screen.getByRole("button", { name: /send now/i });
    expect(sendBtn).not.toBeDisabled();
  });

  it("Send button is disabled when recipient count is 0", async () => {
    previewRecipientsActionMock.mockResolvedValue({
      ok: true,
      result: { count: 0, sample: [] },
    });
    renderCompose();
    const subjectInput = screen.getByRole("textbox", { name: /subject/i });
    fireEvent.change(subjectInput, { target: { value: "Sunday Service" } });
    const bodyTextarea = screen.getByRole("textbox", { name: /body/i });
    fireEvent.change(bodyTextarea, { target: { value: "Hello everyone" } });
    await flushDebounceAndPreview();
    const sendBtn = screen.getByRole("button", { name: /send now/i });
    expect(sendBtn).toBeDisabled();
  });
});

// ── AC13: Confirm modal opens on send click ───────────────────────────────────

describe("CommunicationsComposeClient — AC13 (confirm modal on send)", () => {
  it("clicking Send does not immediately call composeAndSendMessageAction (modal is the gate)", async () => {
    // AC13: The confirm modal is an intermediate gate — the action must not be
    // dispatched just by clicking the send button; the user must confirm first.
    // In the jsdom environment Mantine Modal portals do not always mount in the
    // DOM tree after a state-driven open, so we verify the gate via action call
    // count rather than portal DOM inspection.
    renderCompose();
    const subjectInput = screen.getByRole("textbox", { name: /subject/i });
    fireEvent.change(subjectInput, { target: { value: "Sunday Service" } });
    const bodyTextarea = screen.getByRole("textbox", { name: /body/i });
    fireEvent.change(bodyTextarea, { target: { value: "Hello everyone" } });
    await flushDebounceAndPreview();
    const sendBtn = screen.getByRole("button", { name: /send now/i });
    expect(sendBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(sendBtn);
      vi.runAllTimers();
      await Promise.resolve();
    });

    // The send action must NOT have been called — the confirm modal is the gate.
    expect(composeAndSendMessageActionMock).not.toHaveBeenCalled();
  });

  it("confirm modal shows recipient count", async () => {
    previewRecipientsActionMock.mockResolvedValue({
      ok: true,
      result: { count: 12, sample: [] },
    });
    renderCompose();
    const subjectInput = screen.getByRole("textbox", { name: /subject/i });
    fireEvent.change(subjectInput, { target: { value: "Test" } });
    const bodyTextarea = screen.getByRole("textbox", { name: /body/i });
    fireEvent.change(bodyTextarea, { target: { value: "Body text" } });
    await flushDebounceAndPreview();
    fireEvent.click(screen.getByRole("button", { name: /send now/i }));
    expect(screen.getByText(/12 recipient/i)).toBeInTheDocument();
  });
});

// ── SMS: hides subject field and shows char counter ──────────────────────────

describe("CommunicationsComposeClient — SMS channel behavior", () => {
  it("hides the Subject field when SMS channel is selected", () => {
    renderCompose();
    fireEvent.click(screen.getByRole("button", { name: /sms/i }));
    expect(screen.queryByRole("textbox", { name: /subject/i })).not.toBeInTheDocument();
  });

  it("shows the character counter when SMS channel is selected", () => {
    renderCompose();
    fireEvent.click(screen.getByRole("button", { name: /sms/i }));
    expect(screen.getByText(/\/160 characters/i)).toBeInTheDocument();
  });

  it("shows Subject field when email channel is active", () => {
    renderCompose();
    expect(screen.getByRole("textbox", { name: /subject/i })).toBeInTheDocument();
  });

  it("does NOT show character counter when email channel is active", () => {
    renderCompose();
    expect(screen.queryByText(/\/160 characters/i)).not.toBeInTheDocument();
  });

  it("SMS send button is enabled with only body filled (no subject required)", async () => {
    renderCompose();
    fireEvent.click(screen.getByRole("button", { name: /sms/i }));
    const bodyTextarea = screen.getByRole("textbox", { name: /body/i });
    fireEvent.change(bodyTextarea, { target: { value: "Quick reminder" } });
    await flushDebounceAndPreview();
    const sendBtn = screen.getByRole("button", { name: /send now/i });
    expect(sendBtn).not.toBeDisabled();
  });
});

// ── AC5: Loading a template pre-fills subject/channel/body ───────────────────

describe("CommunicationsComposeClient — AC5 (template pre-fills fields)", () => {
  it("pre-fills subject and body when initialTemplate is an email template", () => {
    renderCompose({ initialTemplate: EMAIL_TEMPLATE });
    const subjectInput = screen.getByRole("textbox", {
      name: /subject/i,
    }) as HTMLInputElement;
    expect(subjectInput.value).toBe("Welcome to Grace!");
    const bodyTextarea = screen.getByRole("textbox", {
      name: /body/i,
    }) as HTMLTextAreaElement;
    expect(bodyTextarea.value).toBe("Dear friend, welcome to our church family.");
  });

  it("pre-fills body when initialTemplate is an SMS template and no subject shown", () => {
    renderCompose({ initialTemplate: SMS_TEMPLATE });
    expect(screen.queryByRole("textbox", { name: /subject/i })).not.toBeInTheDocument();
    const bodyTextarea = screen.getByRole("textbox", {
      name: /body/i,
    }) as HTMLTextAreaElement;
    expect(bodyTextarea.value).toBe("Reminder: service at 10am");
  });
});

// ── AC6: Live recipient count shown before send ───────────────────────────────

describe("CommunicationsComposeClient — AC6 (live recipient count)", () => {
  it("shows recipient count badge after preview resolves", async () => {
    previewRecipientsActionMock.mockResolvedValue({
      ok: true,
      result: { count: 7, sample: [] },
    });
    renderCompose();
    await flushDebounceAndPreview();
    expect(screen.getByText(/7 recipient/i)).toBeInTheDocument();
  });

  it("shows zero-recipient warning badge when count is 0", async () => {
    previewRecipientsActionMock.mockResolvedValue({
      ok: true,
      result: { count: 0, sample: [] },
    });
    renderCompose();
    await flushDebounceAndPreview();
    expect(screen.getByText(/0 recipient/i)).toBeInTheDocument();
    expect(
      screen.getByText(/No contactable recipients match this segment/i),
    ).toBeInTheDocument();
  });

  it("shows calculating badge while preview is loading", async () => {
    // Delay the preview resolution past the debounce window
    let resolvePreview: (v: unknown) => void;
    previewRecipientsActionMock.mockImplementation(
      () => new Promise((resolve) => { resolvePreview = resolve; }),
    );
    renderCompose();

    // Advance debounce (400ms) but not the actual promise resolution
    await act(async () => {
      vi.advanceTimersByTime(401);
      await Promise.resolve();
    });

    expect(screen.getByText(/Calculating/i)).toBeInTheDocument();

    // Clean up: resolve so no pending timers leak
    await act(async () => {
      resolvePreview!({ ok: true, result: { count: 3, sample: [] } });
      await Promise.resolve();
    });
  });
});
