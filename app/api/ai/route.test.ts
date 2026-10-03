import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserMock, rpcMock, fromMock, insertMock, createMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  createMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: getUserMock }, rpc: rpcMock, from: fromMock })),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function Anthropic() {
    return { messages: { create: createMock } };
  }),
}));

import { DEFAULT_HQ_MODEL, POST, scrubPII } from "@/app/api/ai/route";
import { resetRateLimits } from "@/lib/rate-limit";
import { COUNCIL_SEATS, SYNTHESIS_SYSTEM_PROMPT } from "@/lib/council/seats";

// A query chain over one table's rows: select/neq/order/limit, awaited.
function table(rows: Array<Record<string, unknown>>) {
  const chain = {
    select: () => chain,
    neq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: rows, error: null }),
    insert: insertMock,
  };
  return chain;
}

const register: Record<string, Array<Record<string, unknown>>> = {
  hq_tasks: [{ title: "Ship G3.3", status: "todo", owner: "ana@example.org", priority: "high" }],
  hq_risks: [{ title: "Stripe review delay", mitigation: null, severity: 4, probability: 2, owner: "Ops" }],
  hq_decisions: [],
  hq_sessions: [],
};

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

describe("POST /api/ai modes (Council v2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubEnv("AI_HQ_MODEL", "");
    getUserMock.mockResolvedValue({ data: { user: { id: "platform-1" } }, error: null });
    rpcMock.mockResolvedValue({ data: true, error: null });
    fromMock.mockImplementation((name: string) => table(register[name]));
    insertMock.mockResolvedValue({ error: null });
    resetRateLimits();
  });

  const post = (body: unknown) =>
    POST(new Request("http://localhost/api/ai", { method: "POST", body: JSON.stringify(body) }) as never);

  it("advisor: answers on the current default model with HQ's register as scrubbed context, and logs the session", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "Mitigate the Stripe risk first." }] });
    const response = await post({ prompt: "What first? cc bob@example.org" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mode: "advisor", response: "Mitigate the Stripe risk first." });

    const params = createMock.mock.calls[0][0];
    expect(params.model).toBe(DEFAULT_HQ_MODEL);
    expect(params.model).not.toMatch(/3-5-sonnet/);
    const content = params.messages[0].content as string;
    expect(content).toContain("Ship G3.3");
    expect(content).toContain("Stripe review delay");
    expect(content).toContain("Decisions: none recorded");
    expect(content).not.toContain("@example.org");
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ agent_id: "hq-governance", prompt: "What first? cc [EMAIL]" }));
  });

  it("honours AI_HQ_MODEL", async () => {
    vi.stubEnv("AI_HQ_MODEL", "claude-opus-5-5");
    createMock.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    await post({ prompt: "hi" });
    expect(createMock.mock.calls[0][0].model).toBe("claude-opus-5-5");
  });

  it("council: five separate seat calls then a synthesis, returning the status and every seat", async () => {
    createMock.mockImplementation(async (params: { system: string }) => ({
      content: [
        {
          type: "text",
          text: params.system === SYNTHESIS_SYSTEM_PROMPT ? "Status: RATIFIED\nShip it." : "Fine.\nSeat recommendation: RATIFIED",
        },
      ],
    }));
    const response = await post({ prompt: "Proposal: add pledges", mode: "council" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(createMock).toHaveBeenCalledTimes(COUNCIL_SEATS.length + 1);
    expect(body.mode).toBe("council");
    expect(body.status).toBe("RATIFIED");
    expect(body.seats.map((seat: { id: string }) => seat.id)).toEqual(COUNCIL_SEATS.map((seat) => seat.id));
    expect(body.synthesis).toBe("Status: RATIFIED\nShip it.");
    for (const seat of body.seats) {
      expect(seat).toEqual({ id: expect.any(String), name: expect.any(String), review: "Fine.\nSeat recommendation: RATIFIED", recommendation: "RATIFIED" });
    }
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ agent_id: "hq-council", agent_name: "HQ Council" }));
  });

  it("throttles Council runs per person (six model calls each), and logs the mode's own agent id", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "Status: RATIFIED" }] });
    for (let run = 0; run < 3; run += 1) {
      expect((await post({ prompt: "p", mode: "council", agentId: "spoofed", agentName: "Spoofed" })).status).toBe(200);
    }
    expect((await post({ prompt: "p", mode: "council" })).status).toBe(429);
    expect(createMock).toHaveBeenCalledTimes(3 * (COUNCIL_SEATS.length + 1));
    expect(insertMock).not.toHaveBeenCalledWith(expect.objectContaining({ agent_id: "spoofed" }));
    // The advisor has its own allowance.
    expect((await post({ prompt: "p" })).status).toBe(200);
  });

  it("refuses an empty or oversized prompt before calling the model", async () => {
    expect((await post({ prompt: "   " })).status).toBe(400);
    expect((await post({ prompt: "x".repeat(8001) })).status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("doesn't return the provider's error text", async () => {
    createMock.mockRejectedValue(new Error("401 invalid x-api-key sk-test"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await post({ prompt: "hi" });
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("sk-test");
    spy.mockRestore();
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
