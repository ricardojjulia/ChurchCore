import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  getSessionMock,
  getRequestedPublicChurchMock,
  sanitizeRedirectTargetMock,
  getPreferredSupabaseSurfaceForRedirectMock,
  hasSupabaseEnvForSurfaceMock,
  toFriendlySupabaseErrorMessageMock,
  cookiesMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw { url };
  }),
  getSessionMock: vi.fn(),
  getRequestedPublicChurchMock: vi.fn(),
  sanitizeRedirectTargetMock: vi.fn((value?: string) => value ?? "/app/member"),
  getPreferredSupabaseSurfaceForRedirectMock: vi.fn(
    (target?: string) =>
      target?.startsWith("/control") ? "control-plane" : "tenant",
  ),
  hasSupabaseEnvForSurfaceMock: vi.fn(),
  toFriendlySupabaseErrorMessageMock: vi.fn((value: string) => value),
  cookiesMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/app/sign-in/actions", () => ({
  signInAction: vi.fn(),
  signOutAction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  demoProfiles: [
    {
      id: "preview-admin",
      name: "Preview Admin",
      title: "Church Admin",
      email: "admin@example.com",
    },
  ],
  getSession: getSessionMock,
  sanitizeRedirectTarget: sanitizeRedirectTargetMock,
}));

vi.mock("@/lib/public-portal-data", () => ({
  getRequestedPublicChurch: getRequestedPublicChurchMock,
}));

vi.mock("@/lib/supabase/config", () => ({
  getPreferredSupabaseSurfaceForRedirect:
    getPreferredSupabaseSurfaceForRedirectMock,
  hasSupabaseEnvForSurface: hasSupabaseEnvForSurfaceMock,
}));

vi.mock("@/lib/supabase/postgrest", () => ({
  toFriendlySupabaseErrorMessage: toFriendlySupabaseErrorMessageMock,
}));

import SignInPage from "@/app/sign-in/page";

function renderWithMantine(element: React.ReactNode) {
  return render(<MantineProvider>{element}</MantineProvider>);
}

describe("sign-in page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(null);
    getRequestedPublicChurchMock.mockResolvedValue(null);
    getPreferredSupabaseSurfaceForRedirectMock.mockImplementation(
      (target?: string) =>
        target?.startsWith("/control") ? "control-plane" : "tenant",
    );
    hasSupabaseEnvForSurfaceMock.mockReturnValue(false);
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => undefined),
    });
  });

  it("renders preview profile picker when the preferred surface is not configured", async () => {
    const page = await SignInPage({ searchParams: Promise.resolve({}) });
    renderWithMantine(page);

    expect(screen.getByText("Choose a preview account.")).toBeInTheDocument();
    expect(screen.getByText("Preview Admin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
  });

  it("renders account form and alerts when the preferred surface is configured", async () => {
    hasSupabaseEnvForSurfaceMock.mockReturnValue(true);
    toFriendlySupabaseErrorMessageMock.mockReturnValue("Friendly error");

    const page = await SignInPage({
      searchParams: Promise.resolve({
        error: encodeURIComponent("raw-error"),
        message: encodeURIComponent("Check your inbox"),
      }),
    });
    renderWithMantine(page);

    expect(screen.getByRole("textbox", { name: /email/i })).toBeInTheDocument();
    expect(document.querySelector('input[name="password"]')).not.toBeNull();
    expect(screen.getByText("Friendly error")).toBeInTheDocument();
    expect(screen.getByText("Check your inbox")).toBeInTheDocument();
  });

  it("prefers the control-plane auth surface for control redirects", async () => {
    hasSupabaseEnvForSurfaceMock.mockReturnValue(true);

    const page = await SignInPage({
      searchParams: Promise.resolve({ redirectTo: "/control", force: "1" }),
    });
    renderWithMantine(page);

    expect(getPreferredSupabaseSurfaceForRedirectMock).toHaveBeenCalledWith(
      "/control",
    );
    expect(hasSupabaseEnvForSurfaceMock).toHaveBeenCalledWith("control-plane");
    expect(
      screen.queryByRole("button", { name: /create account/i }),
    ).not.toBeInTheDocument();
  });

  it("redirects active session to sanitized target", async () => {
    getSessionMock.mockResolvedValue({ canAccessControl: false });

    await expect(
      SignInPage({ searchParams: Promise.resolve({ redirectTo: "/workspace" }) }),
    ).rejects.toMatchObject({ url: "/workspace" });
  });
});
