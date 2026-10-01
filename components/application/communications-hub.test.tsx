import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Council Review 28: suppressContactAction is church-admin only, so the
// "Add Suppression" button is shown only to church admins. Secretaries and
// pastors, who can now read the suppression list, no longer get a button
// whose save always fails.

vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/app/communications-actions", () => ({
  broadcastMessageAction: vi.fn(),
  retryCommunicationAction: vi.fn(),
  retryAllEligibleAction: vi.fn(),
  suppressContactAction: vi.fn(),
  getCommunicationDeliveryEventsAction: vi.fn(),
}));

import { CommunicationsHub } from "@/components/application/communications-hub";
import type { ChurchAppSession } from "@/lib/auth";
import type { CommunicationsHubData } from "@/lib/communications-data";

const data: CommunicationsHubData = {
  recentLogs: [],
  recipients: [],
  deliveryEvents: [],
  suppressions: [],
};

function renderAs(roleId: string, hubData: CommunicationsHubData = data) {
  const session = {
    appContext: { roleId, church: { id: "church-1", name: "Grace Church" } },
  } as unknown as ChurchAppSession;
  render(
    <MantineProvider>
      <CommunicationsHub session={session} data={hubData} />
    </MantineProvider>,
  );
  // No i18n provider here, so labels render as their translation keys.
  fireEvent.click(screen.getByRole("tab", { name: /tabSuppressions/ }));
  // The panel is open: its heading renders for every role.
  expect(screen.getByText("suppressedContacts")).toBeInTheDocument();
}

describe("CommunicationsHub suppressions tab", () => {
  it("shows Add Suppression to a church admin", () => {
    renderAs("church-admin");
    expect(screen.getByText("addSuppression")).toBeInTheDocument();
  });

  it.each(["secretary", "pastor"])("hides Add Suppression from a %s", (roleId) => {
    renderAs(roleId);
    expect(screen.queryByText("addSuppression")).not.toBeInTheDocument();
  });

  it("shows each suppression reason in words, not as a raw code (Council Review 29)", () => {
    renderAs("church-admin", {
      ...data,
      suppressions: (["bounce", "unsubscribe", "complaint", "manual"] as const).map((reason, index) => ({
        id: `s-${index}`,
        channel: "email" as const,
        contact: `${reason}@example.test`,
        reason,
        notes: null,
        suppressedByName: null,
        createdAt: "2026-10-01T00:00:00.000Z",
      })),
    });
    for (const key of [
      "suppressionReasonBounce",
      "suppressionReasonUnsubscribe",
      "suppressionReasonComplaint",
      "suppressionReasonManual",
    ]) {
      expect(screen.getByText(key)).toBeInTheDocument();
    }
    expect(screen.queryByText("complaint")).not.toBeInTheDocument();
  });
});
