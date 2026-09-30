import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock, getSessionMock, rpcMock, createTenantServerClientMock } =
  vi.hoisted(() => {
    const redirect = vi.fn((url: string) => {
      throw { url };
    });
    const getSession = vi.fn();
    const rpc = vi.fn();
    const createTenantServerClient = vi.fn(async () => ({
      auth: { getSession },
      rpc,
    }));

    return {
      redirectMock: redirect,
      getSessionMock: getSession,
      rpcMock: rpc,
      createTenantServerClientMock: createTenantServerClient,
    };
  });

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: createTenantServerClientMock,
}));

import HqLayout from "@/app/hq/layout";

describe("HqLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to sign-in when there is no session", async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: null } });

    await expect(
      HqLayout({ children: <div>content</div> }),
    ).rejects.toEqual({ url: "/sign-in" });

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("redirects anyone who isn't a platform admin, church admins included (S5)", async () => {
    getSessionMock.mockResolvedValueOnce({
      data: { session: { user: { id: "user-1" } } },
    });
    rpcMock.mockResolvedValueOnce({ data: false, error: null });

    await expect(
      HqLayout({ children: <div>content</div> }),
    ).rejects.toEqual({ url: "/app" });
  });

  it("redirects to /app when the role RPC errors", async () => {
    getSessionMock.mockResolvedValueOnce({
      data: { session: { user: { id: "user-1" } } },
    });
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    await expect(
      HqLayout({ children: <div>content</div> }),
    ).rejects.toEqual({ url: "/app" });
  });

  it("renders children for a platform admin", async () => {
    getSessionMock.mockResolvedValueOnce({
      data: { session: { user: { id: "user-1" } } },
    });
    rpcMock.mockResolvedValueOnce({ data: true, error: null });

    const result = await HqLayout({ children: <div>content</div> });
    expect(result).toBeTruthy();
    expect(rpcMock).toHaveBeenCalledWith("is_platform_admin");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
