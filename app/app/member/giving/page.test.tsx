import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  requireChurchSessionMock,
  getDonorPortalDataMock,
  applicationShellMock,
  donorPortalMock,
  memberBottomNavMock,
  onlineGivingNoticeMock,
  onlineGivingStatusMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw { url };
  }),
  requireChurchSessionMock: vi.fn(),
  getDonorPortalDataMock: vi.fn(),
  applicationShellMock: vi.fn(({ title, description, children }: { title: string; description: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </div>
  )),
  donorPortalMock: vi.fn(() => <div>Donor Portal</div>),
  memberBottomNavMock: vi.fn(() => <div>Bottom Nav</div>),
  onlineGivingNoticeMock: vi.fn(),
  onlineGivingStatusMock: vi.fn(),
}));

vi.mock("@/lib/stripe/donations", () => ({
  onlineGivingNotice: onlineGivingNoticeMock,
  onlineGivingStatus: onlineGivingStatusMock,
  stripePublishableKey: () => "pk_test_123",
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/donations-data", () => ({
  getDonorPortalData: getDonorPortalDataMock,
}));

vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: applicationShellMock,
}));

vi.mock("@/components/application/member-bottom-nav", () => ({
  MemberBottomNav: memberBottomNavMock,
}));

vi.mock("@/components/portal/donor-portal", () => ({
  DonorPortal: donorPortalMock,
}));

import MemberGivingPage from "@/app/app/member/giving/page";

describe("member giving page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "member", church: { id: "church-1", name: "Grace Church" } },
      homePath: "/app/church-admin",
    });
    getDonorPortalDataMock.mockResolvedValue({ donations: [] });
    onlineGivingNoticeMock.mockReturnValue(null);
    onlineGivingStatusMock.mockResolvedValue({ mode: "stub", stripeAccount: null });
  });

  it("redirects non-member roles to their home path", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "church-admin", church: { name: "Grace Church" } },
      homePath: "/app/church-admin",
    });

    await expect(MemberGivingPage()).rejects.toMatchObject({ url: "/app/church-admin" });
  });

  it("renders shell and donor portal for members", async () => {
    const page = await MemberGivingPage();
    render(page);

    expect(screen.getByText("My Giving")).toBeInTheDocument();
    expect(screen.getByText("Grace Church")).toBeInTheDocument();
    expect(screen.getByText("Donor Portal")).toBeInTheDocument();
    expect(getDonorPortalDataMock).toHaveBeenCalled();
    expect(onlineGivingStatusMock).toHaveBeenCalledWith("church-1");
    expect(donorPortalMock).toHaveBeenCalledWith({ data: { donations: [] }, givingNotice: null, publishableKey: null, stripeAccount: null }, undefined);
  });

  it("tells members up front when online giving is off (Council Review 22)", async () => {
    onlineGivingNoticeMock.mockReturnValue("Online card giving isn't available yet.");
    render(await MemberGivingPage());

    expect(donorPortalMock).toHaveBeenCalledWith(
      { data: { donations: [] }, givingNotice: "Online card giving isn't available yet.", publishableKey: null, stripeAccount: null },
      undefined,
    );
  });

  it("hands the card form Stripe's publishable key and the church's account only in live mode (G3.0, ADR 0025)", async () => {
    onlineGivingStatusMock.mockResolvedValue({ mode: "live", stripeAccount: "acct_church1" });
    onlineGivingNoticeMock.mockReturnValue(null);
    render(await MemberGivingPage());

    expect(donorPortalMock).toHaveBeenCalledWith(
      { data: { donations: [] }, givingNotice: null, publishableKey: "pk_test_123", stripeAccount: "acct_church1" },
      undefined,
    );
  });
});
