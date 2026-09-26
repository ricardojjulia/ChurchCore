import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// No test file previously existed for this page. Its role gate was widened
// today from church-admin-only to church-admin/pastor/ministry-leader (see
// app/app/church-admin/volunteers/schedules/page.tsx and
// .../schedules/[id]/page.tsx for the sibling gates widened in the same
// change) — this file closes that coverage gap for the volunteer directory
// page itself, including the positive pastor/ministry-leader cases the
// sibling page tests were missing.

// jsdom does not implement ResizeObserver; Mantine's TableScrollContainer requires it.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const {
  redirectMock,
  requireChurchSessionMock,
  getVolunteerDirectoryMock,
  applicationShellMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw { url };
  }),
  requireChurchSessionMock: vi.fn(),
  getVolunteerDirectoryMock: vi.fn(),
  applicationShellMock: vi.fn(
    ({ title, description, children }: { title: string; description: string; children: React.ReactNode }) => (
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
        {children}
      </div>
    ),
  ),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/volunteer-data", () => ({
  getVolunteerDirectory: getVolunteerDirectoryMock,
}));

vi.mock("@/app/app/volunteer-actions", () => ({
  updateVolunteerFrequencyAction: vi.fn(),
}));

vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: applicationShellMock,
}));

import VolunteerDirectoryPage from "@/app/app/church-admin/volunteers/page";

function sessionFor(roleId: string) {
  return {
    appContext: { roleId, church: { id: "church-1", name: "Grace Church" } },
    homePath: "/app/member",
    source: "supabase",
  };
}

describe("volunteer directory page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVolunteerDirectoryMock.mockResolvedValue([]);
  });

  it("redirects member roles (read-only, no write access)", async () => {
    requireChurchSessionMock.mockResolvedValueOnce(sessionFor("member"));

    await expect(VolunteerDirectoryPage()).rejects.toMatchObject({ url: "/app/member" });
  });

  it("redirects volunteer roles (read-only, no write access)", async () => {
    requireChurchSessionMock.mockResolvedValueOnce(sessionFor("volunteer"));

    await expect(VolunteerDirectoryPage()).rejects.toMatchObject({ url: "/app/member" });
  });

  it("renders for church-admin", async () => {
    requireChurchSessionMock.mockResolvedValueOnce(sessionFor("church-admin"));

    const page = await VolunteerDirectoryPage();
    render(<MantineProvider>{page}</MantineProvider>);

    expect(screen.getByText("Volunteers")).toBeInTheDocument();
    expect(screen.getByText("Grace Church")).toBeInTheDocument();
  });

  it("renders for pastor (does not redirect)", async () => {
    requireChurchSessionMock.mockResolvedValueOnce(sessionFor("pastor"));

    const page = await VolunteerDirectoryPage();
    render(<MantineProvider>{page}</MantineProvider>);

    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByText("Volunteers")).toBeInTheDocument();
    expect(getVolunteerDirectoryMock).toHaveBeenCalled();
  });

  it("renders for ministry-leader (does not redirect)", async () => {
    requireChurchSessionMock.mockResolvedValueOnce(sessionFor("ministry-leader"));

    const page = await VolunteerDirectoryPage();
    render(<MantineProvider>{page}</MantineProvider>);

    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByText("Volunteers")).toBeInTheDocument();
    expect(getVolunteerDirectoryMock).toHaveBeenCalled();
  });

  it("renders a volunteer row with a monthly-limit input", async () => {
    requireChurchSessionMock.mockResolvedValueOnce(sessionFor("church-admin"));
    getVolunteerDirectoryMock.mockResolvedValueOnce([
      {
        profileId: "p-1",
        fullName: "Grace Adeyemi",
        email: "grace@example.org",
        phone: null,
        skills: ["audio"],
        maxServicesPerMonth: 2,
        totalHours: 4,
        shiftsThisYear: 3,
        lastServedDate: null,
        backgroundCheckDate: null,
      },
    ]);

    const page = await VolunteerDirectoryPage();
    render(<MantineProvider>{page}</MantineProvider>);

    expect(screen.getByRole("columnheader", { name: "Monthly limit" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Monthly limit for Grace Adeyemi" })).toHaveValue("2");
  });
});
