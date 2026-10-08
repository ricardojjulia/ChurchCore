import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The shell and the self-service panels are tested on their own; here they are
// stand-ins so the page's own content (G2.1: church-time dates) is what renders.
vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/application/church-app-context-banner", () => ({ ChurchAppContextBanner: () => null }));
vi.mock("@/components/application/member-bottom-nav", () => ({ MemberBottomNav: () => null }));
vi.mock("@/components/application/member-mobile-checkin-card", () => ({ MemberMobileCheckInCard: () => null }));
vi.mock("@/components/application/member-event-registration-panel", () => ({ MemberEventRegistrationPanel: () => null }));
vi.mock("@/components/application/member-family-edit", () => ({ MemberFamilyEdit: () => null }));
vi.mock("@/components/application/notification-preferences-form", () => ({ NotificationPreferencesForm: () => null }));
vi.mock("@/components/application/member-profile-edit", () => ({ MemberProfileEdit: () => null }));

import { MemberPortalHome } from "@/components/application/member-portal-home";
import { I18nProvider } from "@/components/i18n-provider";
import type { ChurchAppSession } from "@/lib/auth";
import type { MemberPortalData } from "@/lib/member-portal-data";

function sessionIn(timezone: string) {
  return {
    userId: "login-1",
    profile: { name: "David" },
    appContext: { church: { id: "church-1", name: "Grace Church", timezone }, roleId: "member" },
  } as unknown as ChurchAppSession;
}

const data = {
  profile: null,
  ministries: [],
  upcomingEvents: [
    { id: "e1", title: "Sunday Evening", description: null, startsAt: "2026-10-05T00:00:00Z", endsAt: "2026-10-05T01:00:00Z", category: "worship", visibility: "members", ministryName: null },
  ],
  attendanceHistory: [
    { id: "a1", checkedInAt: "2026-10-05T00:00:00Z", status: "present", checkInMethod: "mobile", eventTitle: "Sunday Evening" },
  ],
  attendanceTrend: [],
  upcomingServing: [
    { id: "s1", roleTitle: "Greeter", isConfirmed: true, startsAt: "2026-10-05T00:00:00Z", eventTitle: "Sunday Evening" },
  ],
  family: null,
  directory: [],
  notificationPreferences: null,
  needsCommunicationPreferencesSetup: false,
  profileChangeStatus: "none",
  profileChangeReviewerNote: null,
  familyChangeStatus: "none",
  familyChangeReviewerNote: null,
  givingSummary: null,
  myGroups: [],
} as unknown as MemberPortalData;

function renderHome(timezone: string) {
  return render(
    <I18nProvider locale="en">
      <MantineProvider>
        <MemberPortalHome session={sessionIn(timezone)} data={data} mobileCheckInOptions={[]} eventRegistrationOptions={[]} />
      </MantineProvider>
    </I18nProvider>,
  );
}

describe("MemberPortalHome (G2.1)", () => {
  it("shows an 8 pm Sunday event on Sunday in the church's zone, where UTC says Monday", () => {
    renderHome("America/New_York");
    expect(screen.getAllByText("Sun, Oct 4, 8:00 PM").length).toBe(2); // upcoming event + attendance history
    expect(screen.getByText(/Oct 4 • Greeter/)).toBeInTheDocument();
  });

  it("falls back to UTC for an unknown zone", () => {
    renderHome("Not/AZone");
    expect(screen.getAllByText("Mon, Oct 5, 12:00 AM").length).toBe(2);
  });

  it("marks Open Schedule as the first-screen primary action and keeps all four quick actions", () => {
    renderHome("America/New_York");
    const quick = ["Open schedule", "Browse groups", "View giving", "Manage family"].map((n) => screen.getAllByRole("link", { name: new RegExp(n, "i") })[0]);
    expect(quick[0]).toHaveAttribute("data-primary-action");
    expect(quick[1]).not.toHaveAttribute("data-primary-action");
  });
});
