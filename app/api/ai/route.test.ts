import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

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
vi.mock("@/lib/ai/gateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/gateway")>()),
  completeChat: createMock,
}));

import { AiProviderError } from "@/lib/ai/gateway";
import { maxDuration, POST, scrubPII } from "@/app/api/ai/route";
import { resetRateLimits } from "@/lib/rate-limit";
import { ADVISOR_SYSTEM_PROMPT, COUNCIL_SEATS, SYNTHESIS_SYSTEM_PROMPT } from "@/lib/council/seats";

// A query chain over one table's rows: select/neq/order/limit, awaited.
function table(rows: Array<Record<string, unknown>>) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    neq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: rows, error: null }),
    insert: insertMock,
  };
  return chain;
}

const completion = (text: string, extra: Record<string, unknown> = {}) => ({
  text,
  model: "anthropic/claude-sonnet-5.5",
  provider: "openrouter",
  usage: { promptTokens: 100, completionTokens: 40, costUsd: 0.0007 },
  ...extra,
});

const register: Record<string, Array<Record<string, unknown>>> = {
  hq_tasks: [{ title: "Ship G3.3", status: "todo", owner: "ana@example.org", priority: "high" }],
  hq_risks: [{ title: "Stripe review delay, call 787-555-0142", severity: 4, probability: 2 }],
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

  it("lets a platform admin through: without any AI key it says AI isn't configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
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
    vi.stubEnv("OPENROUTER_API_KEY", "or-test");
    getUserMock.mockResolvedValue({ data: { user: { id: "platform-1" } }, error: null });
    rpcMock.mockResolvedValue({ data: true, error: null });
    fromMock.mockImplementation((name: string) => table(register[name]));
    insertMock.mockResolvedValue({ error: null });
    resetRateLimits();
  });

  const post = (body: unknown) =>
    POST(new Request("http://localhost/api/ai", { method: "POST", body: JSON.stringify(body) }) as never);

  it("advisor: answers through the gateway with HQ's register as scrubbed context, and logs the session", async () => {
    createMock.mockResolvedValue(completion("Mitigate the Stripe risk first."));
    const response = await post({ prompt: "What first? cc bob@example.org" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mode: "advisor", response: "Mitigate the Stripe risk first." });

    const params = createMock.mock.calls[0][0];
    expect(params.feature).toBe("hq-advisor");
    expect(params.system).toBe(ADVISOR_SYSTEM_PROMPT);
    const content = params.messages[0].content as string;
    expect(content).toContain("Ship G3.3");
    expect(content).toContain("Stripe review delay");
    expect(content).not.toContain("555-0142");
    expect(content).toContain("[PHONE]");
    expect(content).toContain("Decisions: none recorded");
    expect(content).not.toContain("@example.org");
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ agent_id: "hq-governance", prompt: "What first? cc [EMAIL]" }));
  });

  it("logs the model, provider, tokens and cost on the hq_sessions row", async () => {
    createMock.mockResolvedValue(completion("ok"));
    await post({ prompt: "hi" });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ model_used: "anthropic/claude-sonnet-5.5", provider: "openrouter", prompt_tokens: 100, completion_tokens: 40, cost_usd: 0.0007 }),
    );
  });

  it("council: logs summed usage and the distinct models", async () => {
    createMock.mockImplementation(async (params: { feature: string }) =>
      completion("Status: RATIFIED", { model: params.feature === "hq-council-synthesis" ? "anthropic/claude-opus-5.5" : "anthropic/claude-sonnet-5.5" }),
    );
    await post({ prompt: "p", mode: "council" });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model_used: "anthropic/claude-sonnet-5.5, anthropic/claude-opus-5.5",
        provider: "openrouter",
        prompt_tokens: 600,
        completion_tokens: 240,
        cost_usd: 0.0042,
      }),
    );
  });

  it("council: five separate seat calls then a synthesis, returning the status and every seat", async () => {
    createMock.mockImplementation(async (params: { system: string }) =>
      completion(params.system === SYNTHESIS_SYSTEM_PROMPT ? "Status: RATIFIED\nShip it." : "Fine.\nSeat recommendation: RATIFIED"),
    );
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
    createMock.mockResolvedValue(completion("Status: RATIFIED"));
    for (let run = 0; run < 3; run += 1) {
      expect((await post({ prompt: "p", mode: "council", agentId: "spoofed", agentName: "Spoofed" })).status).toBe(200);
    }
    expect((await post({ prompt: "p", mode: "council" })).status).toBe(429);
    expect(createMock).toHaveBeenCalledTimes(3 * (COUNCIL_SEATS.length + 1));
    expect(insertMock).not.toHaveBeenCalledWith(expect.objectContaining({ agent_id: "spoofed" }));
    // The advisor has its own allowance.
    expect((await post({ prompt: "p" })).status).toBe(200);
  });

  it("reads only titles and structured fields from the register, never owners or mitigation notes", async () => {
    createMock.mockResolvedValue(completion("ok"));
    await post({ prompt: "hi" });
    const selects = fromMock.mock.results.filter((result) => (result.value as { select: Mock }).select.mock.calls.length).map((result) => (result.value as { select: Mock }).select.mock.calls[0][0] as string);
    expect(selects).toHaveLength(3);
    for (const columns of selects) {
      expect(columns).not.toMatch(/owner|mitigation/);
    }
  });

  it("refuses a body that isn't a JSON object, or an unknown mode, before calling the model", async () => {
    expect((await post(null)).status).toBe(400);
    expect((await post(["hi"])).status).toBe(400);
    expect((await post({ prompt: "hi", mode: "councl" })).status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("refuses an empty or oversized prompt before calling the model", async () => {
    expect((await post({ prompt: "   " })).status).toBe(400);
    expect((await post({ prompt: "x".repeat(8001) })).status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("allows 60 s, gives the advisor 50 s, and still exports scrubPII", async () => {
    expect(maxDuration).toBe(60);
    createMock.mockResolvedValue(completion("ok"));
    await post({ prompt: "hi" });
    expect(createMock.mock.calls[0][0].timeoutMs).toBe(55_000);
    expect(createMock.mock.calls[0][0].maxTokens).toBe(3000);
    expect(scrubPII("a@b.org")).toBe("[EMAIL]");
  });

  it.each([
    [402, 502, "AI credits are exhausted. A platform admin needs to top up the AI account."],
    [429, 503, "The AI provider is busy. Try again in a minute."],
    [500, 502, "The AI request failed. Try again."],
  ])("maps provider status %i to HTTP %i with a fixed message", async (status, http, message) => {
    createMock.mockRejectedValue(new AiProviderError(status));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await post({ prompt: "hi" });
    expect(response.status).toBe(http);
    expect(await response.json()).toEqual({ error: message });
    spy.mockRestore();
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
