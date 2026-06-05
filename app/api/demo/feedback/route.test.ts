import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createControlPlaneAdminClientMock, rpcMock } = vi.hoisted(() => {
  const rpcMock = vi.fn().mockResolvedValue({ error: null });
  const createControlPlaneAdminClientMock = vi.fn().mockReturnValue({ rpc: rpcMock });
  return { createControlPlaneAdminClientMock, rpcMock };
});

vi.mock("@/lib/supabase/control-plane", () => ({
  createControlPlaneAdminClient: createControlPlaneAdminClientMock,
}));

import { POST } from "@/app/api/demo/feedback/route";

const VALID_SESSION_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const VALID_FINGERPRINT = "a".repeat(64);

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
  fingerprint: VALID_FINGERPRINT,
  note: "Something broke",
  breadcrumbs: [],
  user_email: null,
  user_role: null,
  demo_version: "1.0.0",
};

describe("POST /api/demo/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ error: null });
    createControlPlaneAdminClientMock.mockReturnValue({ rpc: rpcMock });
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

    it("returns 400 when fingerprint is missing", async () => {
      const response = await POST(makeRequest({ ...validBody, fingerprint: undefined }));

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Invalid fingerprint");
    });

    it("returns 400 when fingerprint is not 64 hex chars", async () => {
      const response = await POST(makeRequest({ ...validBody, fingerprint: "abc123" }));

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Invalid fingerprint");
    });

    it("returns 400 when fingerprint contains non-hex characters", async () => {
      const response = await POST(makeRequest({ ...validBody, fingerprint: "g".repeat(64) }));

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Invalid fingerprint");
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
      expect(rpcMock).toHaveBeenCalledWith("upsert_demo_feedback", expect.objectContaining({
        p_fingerprint: VALID_FINGERPRINT,
        p_session_id: VALID_SESSION_ID,
        p_route: "/demo/dashboard",
        p_category: "BUG",
      }));
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
      rpcMock.mockResolvedValueOnce({ error: { message: "RPC failed" } });

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

    it("returns 429 after 20 requests within 60s from the same session_id", async () => {
      const sessionId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
      const body = { ...validBody, session_id: sessionId };

      for (let i = 0; i < 20; i++) {
        const response = await POST(makeRequest(body));
        expect(response.status).toBe(200);
      }

      const rateLimitedResponse = await POST(makeRequest(body));
      expect(rateLimitedResponse.status).toBe(429);
      const rateLimitedBody = await rateLimitedResponse.json() as { error: string };
      expect(rateLimitedBody.error).toBe("Rate limit exceeded");
    });
  });
});
