import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserMock, rpcMock } = vi.hoisted(() => ({ getUserMock: vi.fn(), rpcMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: getUserMock }, rpc: rpcMock })),
}));

import { POST, scrubPII } from "@/app/api/ai/route";

describe("POST /api/ai gate (S5, Council Review 27)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const request = () =>
    new Request("http://localhost/api/ai", { method: "POST", body: JSON.stringify({ prompt: "hi" }) }) as never;

  it("refuses signed-out callers", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(request())).status).toBe(401);
  });

  it("refuses signed-in users who aren't platform admins, before any AI call", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    rpcMock.mockResolvedValue({ data: false, error: null });
    expect((await POST(request())).status).toBe(403);
    expect(rpcMock).toHaveBeenCalledWith("is_platform_admin");
  });

  it("lets a platform admin through: without ANTHROPIC_API_KEY it says AI isn't configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    getUserMock.mockResolvedValue({ data: { user: { id: "platform-1" } }, error: null });
    rpcMock.mockResolvedValue({ data: true, error: null });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "AI features are not configured in this environment." });
    vi.unstubAllEnvs();
  });
});

describe("scrubPII", () => {
  it("scrubs email addresses", () => {
    expect(scrubPII("Contact pastor.bob+leads@grace-harbor.org for help")).toBe(
      "Contact [EMAIL] for help",
    );
  });

  it("scrubs UUIDs", () => {
    expect(
      scrubPII("profile 3fa85f64-5717-4562-b3fc-2c963f66afa6 flagged"),
    ).toBe("profile [ID] flagged");
  });

  it("returns an empty string for empty input", () => {
    expect(scrubPII("")).toBe("");
  });

  it("does not hang on adversarial input with many repeated % characters", () => {
    const adversarial = "%".repeat(50_000) + "!";
    const start = performance.now();
    const result = scrubPII(adversarial);
    const durationMs = performance.now() - start;

    expect(result).toBe(adversarial);
    expect(durationMs).toBeLessThan(1000);
  });
});
