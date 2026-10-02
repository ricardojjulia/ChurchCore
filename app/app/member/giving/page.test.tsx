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
  onlineGivingModeMock,
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
  onlineGivingModeMock: vi.fn(() => "stub"),
}));

vi.mock("@/lib/stripe/donations", () => ({
  onlineGivingNotice: onlineGivingNoticeMock,
  onlineGivingMode: onlineGivingModeMock,
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
      appContext: { roleId: "member", church: { name: "Grace Church" } },
      homePath: "/app/church-admin",
    });
    getDonorPortalDataMock.mockResolvedValue({ donations: [] });
    onlineGivingNoticeMock.mockReturnValue(null);
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
    expect(donorPortalMock).toHaveBeenCalledWith({ data: { donations: [] }, givingNotice: null, publishableKey: null }, undefined);
  });

  it("tells members up front when online giving is off (Council Review 22)", async () => {
    onlineGivingNoticeMock.mockReturnValue("Online card giving isn't available yet.");
    render(await MemberGivingPage());

    expect(donorPortalMock).toHaveBeenCalledWith(
      { data: { donations: [] }, givingNotice: "Online card giving isn't available yet.", publishableKey: null },
      undefined,
    );
  });

  it("hands the card form Stripe's publishable key only in live mode (G3.0)", async () => {
    onlineGivingModeMock.mockReturnValue("live");
    onlineGivingNoticeMock.mockReturnValue(null);
    render(await MemberGivingPage());

    expect(donorPortalMock).toHaveBeenCalledWith(
      { data: { donations: [] }, givingNotice: null, publishableKey: "pk_test_123" },
      undefined,
    );
  });
});
