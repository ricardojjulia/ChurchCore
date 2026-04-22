import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  redirectMock,
  getSessionMock,
  sanitizeRedirectTargetMock,
  hasSupabaseEnvMock,
  toFriendlySupabaseErrorMessageMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw { url };
  }),
  getSessionMock: vi.fn(),
  sanitizeRedirectTargetMock: vi.fn((value?: string) => value ?? "/app/member"),
  hasSupabaseEnvMock: vi.fn(),
  toFriendlySupabaseErrorMessageMock: vi.fn((value: string) => value),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/app/sign-in/actions", () => ({
  signInAction: vi.fn(),
  signOutAction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  demoProfiles: [
    { id: "preview-admin", name: "Preview Admin", title: "Church Admin", email: "admin@example.com" },
  ],
  getSession: getSessionMock,
  sanitizeRedirectTarget: sanitizeRedirectTargetMock,
}));

vi.mock("@/lib/supabase/config", () => ({
  hasSupabaseEnv: hasSupabaseEnvMock,
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
    hasSupabaseEnvMock.mockReturnValue(false);
  });

  it("renders preview profile picker when Supabase is not configured", async () => {
    const page = await SignInPage({ searchParams: Promise.resolve({}) });
    renderWithMantine(page);

    expect(screen.getByText("Choose a preview account.")).toBeInTheDocument();
    expect(screen.getByText("Preview Admin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
  });

  it("renders account form and alerts when Supabase is configured", async () => {
    hasSupabaseEnvMock.mockReturnValue(true);
    toFriendlySupabaseErrorMessageMock.mockReturnValue("Friendly error");

    const page = await SignInPage({
      searchParams: Promise.resolve({ error: encodeURIComponent("raw-error"), message: encodeURIComponent("Check your inbox") }),
    });
    renderWithMantine(page);

    expect(screen.getByRole("textbox", { name: /email/i })).toBeInTheDocument();
    expect(document.querySelector('input[name="password"]')).not.toBeNull();
    expect(screen.getByText("Friendly error")).toBeInTheDocument();
    expect(screen.getByText("Check your inbox")).toBeInTheDocument();
  });

  it("redirects active session to sanitized target", async () => {
    getSessionMock.mockResolvedValue({ canAccessControl: false });

    await expect(
      SignInPage({ searchParams: Promise.resolve({ redirectTo: "/workspace" }) }),
    ).rejects.toMatchObject({ url: "/workspace" });
  });
});
