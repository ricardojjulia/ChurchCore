import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { removeSuppressionActionMock, suppressContactActionMock, routerMock } = vi.hoisted(() => ({
  removeSuppressionActionMock: vi.fn<(input: { id: string; reason: string }) => Promise<{ ok: true } | { ok: false; error: string }>>(async () => ({ ok: true })),
  suppressContactActionMock: vi.fn<(input: unknown) => Promise<{ ok: true } | { ok: false; error: string }>>(async () => ({ ok: true })),
  routerMock: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));
vi.mock("@/app/app/communications-actions", () => ({
  removeSuppressionAction: removeSuppressionActionMock,
  suppressContactAction: suppressContactActionMock,
}));
vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: ({ children, navItems }: { children: React.ReactNode; navItems: Array<{ href: string; label: string }> }) => (
    <div data-testid="app-shell">
      <nav>{navItems.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}</nav>
      {children}
    </div>
  ),
}));

import { CommunicationsSuppressionsWorkspace } from "@/components/application/communications-suppressions-workspace";
import type { ChurchAppSession } from "@/lib/auth";
import type { SuppressionRow } from "@/lib/communications/suppression-types";

const session = {
  homePath: "/app",
  appContext: { church: { id: "church-1", name: "Grace Church" }, roleId: "church-admin" },
} as unknown as ChurchAppSession;

function row(over: Partial<SuppressionRow>): SuppressionRow {
  return {
    id: "s1",
    channel: "email",
    contact: "bounced@example.com",
    reason: "bounce",
    notes: null,
    memberName: null,
    addedByName: null,
    createdAt: "2026-10-01T12:00:00.000Z",
    ...over,
  };
}

const rows: SuppressionRow[] = [
  row({ id: "s1", memberName: "Ann Member" }),
  row({ id: "s2", contact: "unsub@example.com", reason: "unsubscribe" }),
  row({ id: "s3", contact: "spam@example.com", reason: "complaint" }),
  row({ id: "s4", channel: "sms", contact: "+15550100", reason: "manual", addedByName: "Nora Admin", notes: "Asked by phone" }),
];

function renderIt(canManage: boolean, data = rows, truncated = false) {
  return render(
    <MantineProvider>
      <CommunicationsSuppressionsWorkspace session={session} suppressions={data} truncated={truncated} canManage={canManage} />
    </MantineProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("CommunicationsSuppressionsWorkspace", () => {
  it("lists reasons in words, member name, notes and who added a manual row", () => {
    renderIt(true);
    expect(screen.getByText("Bounced")).toBeInTheDocument();
    expect(screen.getByText("Unsubscribed (link or STOP)")).toBeInTheDocument();
    expect(screen.getByText("Marked as spam")).toBeInTheDocument();
    expect(screen.getByText("Added by staff")).toBeInTheDocument();
    expect(screen.getByText("Ann Member")).toBeInTheDocument();
    expect(screen.getByText("Asked by phone")).toBeInTheDocument();
    expect(screen.getByText(/by Nora Admin/)).toBeInTheDocument();
  });

  it("has the Suppressions item in the sub-nav", () => {
    renderIt(true);
    expect(screen.getByRole("link", { name: "Suppressions" })).toHaveAttribute("href", "/app/communications/suppressions");
  });

  it("filters by channel and searches by contact or member name", () => {
    renderIt(true);
    fireEvent.click(screen.getByText("SMS", { selector: "label *, label" }));
    expect(screen.getAllByTestId("suppression-row")).toHaveLength(1);
    fireEvent.click(screen.getByText("All"));
    fireEvent.change(screen.getByLabelText("Search by contact or name"), { target: { value: "ann mem" } });
    expect(screen.getAllByTestId("suppression-row")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Search by contact or name"), { target: { value: "zzz" } });
    expect(screen.getByText("No suppressions match your filter.")).toBeInTheDocument();
  });

  it("shows an empty state", () => {
    renderIt(true, []);
    expect(screen.getByText(/No suppressed contacts/)).toBeInTheDocument();
  });

  it("admins: Remove only on bounce and manual rows; locked rows say only the person can opt back in", () => {
    renderIt(true);
    expect(screen.getAllByRole("button", { name: /Remove suppression for/ })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Remove suppression for unsub@example.com" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove suppression for spam@example.com" })).toBeNull();
    expect(screen.getAllByText("Only the person can opt back in")).toHaveLength(2);
  });

  it("pastor/secretary view: list but no add form, no Remove, no actions column", () => {
    renderIt(false);
    expect(screen.getAllByTestId("suppression-row")).toHaveLength(4);
    expect(screen.queryByText("Add a suppression")).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(screen.queryByText("Actions")).toBeNull();
    expect(screen.queryByText("Only the person can opt back in")).toBeNull();
  });

  it("removal needs a reason of 5+ characters, then calls the action and refreshes", async () => {
    renderIt(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove suppression for bounced@example.com" }));
    const confirm = await screen.findByRole("button", { name: "Remove suppression" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "ab" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Mailbox fixed" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(removeSuppressionActionMock).toHaveBeenCalledWith({ id: "s1", reason: "Mailbox fixed" }));
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
  });

  it("shows a removal error from the server in the modal", async () => {
    removeSuppressionActionMock.mockResolvedValueOnce({ ok: false, error: "Suppression not found." });
    renderIt(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove suppression for bounced@example.com" }));
    fireEvent.change(await screen.findByLabelText(/Reason/), { target: { value: "Mailbox fixed" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove suppression" }));
    expect(await screen.findByText("Suppression not found.")).toBeInTheDocument();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("add form calls suppressContactAction and refreshes; shows a duplicate error", async () => {
    renderIt(true);
    fireEvent.change(screen.getByLabelText(/^Contact/), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add suppression" }));
    await waitFor(() =>
      expect(suppressContactActionMock).toHaveBeenCalledWith({
        channel: "email",
        contact: "new@example.com",
        reason: "manual",
        notes: "",
      }),
    );
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());

    routerMock.refresh.mockClear();
    suppressContactActionMock.mockResolvedValueOnce({ ok: false, error: "That contact is already suppressed." });
    fireEvent.change(screen.getByLabelText(/^Contact/), { target: { value: "dup@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add suppression" }));
    expect(await screen.findByText("That contact is already suppressed.")).toBeInTheDocument();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("announces feedback in a polite live region", async () => {
    renderIt(true);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    fireEvent.change(screen.getByLabelText(/^Contact/), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add suppression" }));
    await waitFor(() => expect(region).toHaveTextContent("Contact suppressed."));
  });

  it("shows the truncation notice only when the list was capped", () => {
    const { unmount } = renderIt(true, rows, true);
    expect(screen.getByText(/search to find others/)).toBeInTheDocument();
    unmount();
    renderIt(true);
    expect(screen.queryByText(/search to find others/)).toBeNull();
  });
});
