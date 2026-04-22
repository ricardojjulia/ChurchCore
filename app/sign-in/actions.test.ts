import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  revalidatePathMock,
  cookieSetMock,
  cookieDeleteMock,
  cookiesMock,
  headersMock,
  clearAppContextSelectionMock,
  getDemoProfileMock,
  sanitizeRedirectTargetMock,
  hasSupabaseEnvMock,
  toFriendlySupabaseErrorMessageMock,
  signOutMock,
  signInWithPasswordMock,
  createSupabaseServerClientMock,
} = vi.hoisted(() => {
  const redirect = vi.fn((url: string) => {
    throw { url };
  });
  const revalidatePath = vi.fn();

  const cookieSet = vi.fn();
  const cookieDelete = vi.fn();
  const cookies = vi.fn(async () => ({
    set: cookieSet,
    delete: cookieDelete,
  }));
  const headers = vi.fn(async () => ({ get: vi.fn(() => null) }));

  const clearAppContextSelection = vi.fn(async () => undefined);
  const getDemoProfile = vi.fn();
  const sanitizeRedirectTarget = vi.fn((target: string) => target);

  const hasSupabaseEnv = vi.fn();
  const toFriendlySupabaseErrorMessage = vi.fn((message: string) => message);

  const signOut = vi.fn(async () => ({ error: null }));
  const signInWithPassword = vi.fn(async () => ({ error: null }));
  const signUp = vi.fn(async () => ({ error: null }));
  const createSupabaseServerClient = vi.fn(async () => ({
    auth: {
      signOut,
      signInWithPassword,
      signUp,
    },
  }));

  return {
    redirectMock: redirect,
    revalidatePathMock: revalidatePath,
    cookieSetMock: cookieSet,
    cookieDeleteMock: cookieDelete,
    cookiesMock: cookies,
    headersMock: headers,
    clearAppContextSelectionMock: clearAppContextSelection,
    getDemoProfileMock: getDemoProfile,
    sanitizeRedirectTargetMock: sanitizeRedirectTarget,
    hasSupabaseEnvMock: hasSupabaseEnv,
    toFriendlySupabaseErrorMessageMock: toFriendlySupabaseErrorMessage,
    signOutMock: signOut,
    signInWithPasswordMock: signInWithPassword,
    signUpMock: signUp,
    createSupabaseServerClientMock: createSupabaseServerClient,
  };
});

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
  headers: headersMock,
}));

vi.mock("@/lib/auth", () => ({
  clearAppContextSelection: clearAppContextSelectionMock,
  getDemoProfile: getDemoProfileMock,
  sanitizeRedirectTarget: sanitizeRedirectTargetMock,
  sessionCookieName: "churchforge.session",
}));

vi.mock("@/lib/supabase/config", () => ({
  hasSupabaseEnv: hasSupabaseEnvMock,
}));

vi.mock("@/lib/supabase/postgrest", () => ({
  toFriendlySupabaseErrorMessage: toFriendlySupabaseErrorMessageMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createSupabaseServerClientMock,
}));

import { signInAction, signOutAction } from "@/app/sign-in/actions";

describe("sign-in actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sanitizeRedirectTargetMock.mockImplementation((target: string) => target);
    hasSupabaseEnvMock.mockReturnValue(false);
  });

  it("redirects to profile error in preview mode when demo profile is missing", async () => {
    getDemoProfileMock.mockReturnValue(null);

    const formData = new FormData();
    formData.set("profileId", "missing");
    formData.set("redirectTo", "/workspace");

    await expect(signInAction(formData)).rejects.toMatchObject({
      url: "/sign-in?error=profile",
    });
  });

  it("sets preview session cookie and redirects when demo profile exists", async () => {
    getDemoProfileMock.mockReturnValue({ id: "preview-admin" });

    const formData = new FormData();
    formData.set("profileId", "preview-admin");
    formData.set("redirectTo", "/app/member");

    await expect(signInAction(formData)).rejects.toMatchObject({
      url: "/app/member",
    });

    expect(cookieSetMock).toHaveBeenCalledWith(
      "churchforge.session",
      "preview-admin",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      }),
    );
  });

  it("redirects with validation error when Supabase sign-in is missing credentials", async () => {
    hasSupabaseEnvMock.mockReturnValue(true);

    const formData = new FormData();
    formData.set("intent", "sign-in");
    formData.set("email", "");
    formData.set("password", "");
    formData.set("redirectTo", "/workspace");

    await expect(signInAction(formData)).rejects.toMatchObject({
      url: "/sign-in?error=Enter%20both%20email%20and%20password.&redirectTo=%2Fworkspace",
    });
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it("clears app context and redirects to sign-in on sign-out in preview mode", async () => {
    hasSupabaseEnvMock.mockReturnValue(false);

    await expect(signOutAction()).rejects.toMatchObject({
      url: "/sign-in",
    });

    expect(cookieDeleteMock).toHaveBeenCalledWith("churchforge.session");
    expect(clearAppContextSelectionMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });

  it("calls Supabase auth sign-out when Supabase environment is enabled", async () => {
    hasSupabaseEnvMock.mockReturnValue(true);

    await expect(signOutAction()).rejects.toMatchObject({
      url: "/sign-in",
    });

    expect(signOutMock).toHaveBeenCalled();
    expect(createSupabaseServerClientMock).toHaveBeenCalled();
  });
});
