import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createControlPlaneAdminClientMock, getSessionMock, rpcMock } = vi.hoisted(() => {
  const rpcMock = vi.fn().mockResolvedValue({ error: null });
  const createControlPlaneAdminClientMock = vi.fn().mockReturnValue({ rpc: rpcMock });
  const getSessionMock = vi.fn().mockResolvedValue(null);
  return { createControlPlaneAdminClientMock, getSessionMock, rpcMock };
});

vi.mock("@/lib/supabase/control-plane", () => ({
  createControlPlaneAdminClient: createControlPlaneAdminClientMock,
}));

vi.mock("@/lib/auth", () => ({
  getSession: getSessionMock,
}));

import { POST } from "@/app/api/demo/feedback/route";

const VALID_SESSION_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/demo/feedback", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const validBody = {
  session_id: VALID_SESSION_ID,
  route: "/demo/dashboard",
  category: "BUG",
  note: "Something broke",
  breadcrumbs: [],
  demo_version: "1.0.0",
  session_duration: 12,
};

describe("POST /api/demo/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: true, error: null });
    createControlPlaneAdminClientMock.mockReturnValue({ rpc: rpcMock });
    getSessionMock.mockResolvedValue(null);
  });

  it("returns 403 when NEXT_PUBLIC_DEMO_MODE is not 'true'", async () => {
    const orig = process.env.NEXT_PUBLIC_DEMO_MODE;
    delete process.env.NEXT_PUBLIC_DEMO_MODE;

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(403);
    const body = await response.json() as { error: string };
    expect(body.error).toBe("Not available");

    process.env.NEXT_PUBLIC_DEMO_MODE = orig;
  });

  it("returns 403 when NEXT_PUBLIC_DEMO_MODE is 'false'", async () => {
    const orig = process.env.NEXT_PUBLIC_DEMO_MODE;
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(403);

    process.env.NEXT_PUBLIC_DEMO_MODE = orig;
  });

  describe("with NEXT_PUBLIC_DEMO_MODE=true", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    });

    it("returns 400 when session_id is missing", async () => {
      const response = await POST(makeRequest({ ...validBody, session_id: undefined }));

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Invalid session_id");
    });

    it("returns 400 when session_id is not a valid UUID format", async () => {
      const response = await POST(makeRequest({ ...validBody, session_id: "not-a-uuid" }));

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Invalid session_id");
    });

    it("returns 400 when route is missing", async () => {
      const response = await POST(makeRequest({ ...validBody, route: undefined }));

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Missing route");
    });

    it("returns 400 when category is invalid", async () => {
      const response = await POST(makeRequest({ ...validBody, category: "TYPO" }));

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Invalid category");
    });

    it("returns 400 when category is missing", async () => {
      const response = await POST(makeRequest({ ...validBody, category: undefined }));

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Invalid category");
    });

    it("returns 400 when note exceeds 2000 characters", async () => {
      const response = await POST(makeRequest({ ...validBody, note: "x".repeat(2001) }));

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Note exceeds 2000 characters");
    });

    it("returns 400 when body is invalid JSON", async () => {
      const response = await POST(
        new NextRequest("http://localhost/api/demo/feedback", {
          method: "POST",
          body: "not json",
          headers: { "Content-Type": "application/json" },
        }),
      );

      expect(response.status).toBe(400);
    });

    it("returns 200 on valid payload", async () => {
      const response = await POST(makeRequest(validBody));

      expect(response.status).toBe(200);
      const body = await response.json() as { ok: boolean };
      expect(body.ok).toBe(true);
      expect(rpcMock).toHaveBeenCalledOnce();
      expect(rpcMock).toHaveBeenCalledWith("submit_demo_feedback", expect.objectContaining({
        p_session_id: VALID_SESSION_ID,
        p_route: "/demo/dashboard",
        p_category: "BUG",
        p_session_duration_seconds: 12,
      }));
      expect(rpcMock.mock.calls[0][1].p_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    });

    it("derives authenticated identity on the server and ignores client identity", async () => {
      getSessionMock.mockResolvedValueOnce({
        profile: {
          email: "authenticated@example.com",
          roleId: "church-admin",
        },
      });

      const response = await POST(makeRequest({
        ...validBody,
        user_email: "spoofed@example.com",
        user_role: "super-admin",
      }));

      expect(response.status).toBe(200);
      expect(getSessionMock).toHaveBeenCalledWith("/demo/dashboard");
      expect(rpcMock).toHaveBeenCalledWith("submit_demo_feedback", expect.objectContaining({
        p_user_email: "authenticated@example.com",
        p_user_role: "church-admin",
      }));
    });

    it("stores no identity for an anonymous report", async () => {
      const response = await POST(makeRequest(validBody));

      expect(response.status).toBe(200);
      expect(rpcMock).toHaveBeenCalledWith("submit_demo_feedback", expect.objectContaining({
        p_user_email: null,
        p_user_role: null,
      }));
    });

    it("ignores a client-provided fingerprint", async () => {
      const clientFingerprint = "f".repeat(64);

      const response = await POST(makeRequest({ ...validBody, fingerprint: clientFingerprint }));

      expect(response.status).toBe(200);
      expect(rpcMock.mock.calls[0][1].p_fingerprint).not.toBe(clientFingerprint);
    });

    it("accepts all valid category values", async () => {
      const categories = ["BUG", "ERROR", "UNEXPECTED_RESULT", "IMPROVEMENT"] as const;
      for (const category of categories) {
        const uniqueSession = `a1b2c3d4-e5f6-7890-abcd-ef1234${String(categories.indexOf(category)).padStart(6, "0")}`;
        const response = await POST(makeRequest({ ...validBody, category, session_id: uniqueSession }));
        expect(response.status).toBe(200);
      }
    });

    it("accepts note of exactly 2000 characters", async () => {
      const response = await POST(makeRequest({ ...validBody, note: "x".repeat(2000) }));

      expect(response.status).toBe(200);
    });

    it("returns 500 when Supabase RPC returns an error", async () => {
      rpcMock.mockResolvedValueOnce({ data: null, error: { message: "RPC failed" } });

      const response = await POST(makeRequest(validBody));

      expect(response.status).toBe(500);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Submission failed");
    });

    it("returns 500 when createControlPlaneAdminClient throws", async () => {
      createControlPlaneAdminClientMock.mockImplementationOnce(() => {
        throw new Error("Config missing");
      });

      const response = await POST(makeRequest(validBody));

      expect(response.status).toBe(500);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Submission failed");
    });

    it("returns 429 when the atomic database RPC rejects the rate limit", async () => {
      rpcMock.mockResolvedValueOnce({ data: false, error: null });

      const rateLimitedResponse = await POST(makeRequest(validBody));
      expect(rateLimitedResponse.status).toBe(429);
      const rateLimitedBody = await rateLimitedResponse.json() as { error: string };
      expect(rateLimitedBody.error).toBe("Rate limit exceeded");
    });

    it("returns 400 for invalid session duration", async () => {
      const response = await POST(makeRequest({ ...validBody, session_duration: -1 }));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid session_duration" });
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid breadcrumbs", async () => {
      const response = await POST(makeRequest({
        ...validBody,
        breadcrumbs: Array.from({ length: 6 }, () => "/demo"),
      }));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid breadcrumbs" });
      expect(rpcMock).not.toHaveBeenCalled();
    });
  });
});
