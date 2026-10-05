import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────────
const {
  completeChatMock,
  supabaseInsertMock,
  supabaseFromMock,
  createTenantServerClientMock,
} = vi.hoisted(() => {
  const supabaseInsert = vi.fn(async () => ({ error: null }));
  const supabaseFrom = vi.fn(() => ({ insert: supabaseInsert }));
  const createTenantServerClient = vi.fn(async () => ({ from: supabaseFrom }));
  const anthropicCreate = vi.fn();

  return {
    completeChatMock: anthropicCreate,
    supabaseInsertMock: supabaseInsert,
    supabaseFromMock: supabaseFrom,
    createTenantServerClientMock: createTenantServerClient,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/gateway", () => ({ completeChat: completeChatMock }));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: createTenantServerClientMock,
}));

// ── Import under test ──────────────────────────────────────────────────────────
import { callMinistryAI } from "./client";

const PROMPT = {
  system: "You are a pastoral assistant.",
  user: "Provide an outline for Romans 8.",
};

describe("callMinistryAI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    completeChatMock.mockResolvedValue({
      text: "Here is your outline.",
      model: "anthropic/claude-haiku-4.5",
      provider: "openrouter",
      usage: { promptTokens: 100, completionTokens: 50, costUsd: 0.00035 },
    });

    supabaseInsertMock.mockResolvedValue({ error: null });
    createTenantServerClientMock.mockResolvedValue({ from: supabaseFromMock });
    supabaseFromMock.mockReturnValue({ insert: supabaseInsertMock });
  });

  it("returns the text from a successful API call", async () => {
    const result = await callMinistryAI(PROMPT, "sermon_planning", "church-1", "profile-1");
    expect(result).toBe("Here is your outline.");
  });

  it("inserts an ai_interactions row after a successful call", async () => {
    await callMinistryAI(PROMPT, "sermon_planning", "church-1", "profile-1");
    expect(supabaseFromMock).toHaveBeenCalledWith("ai_interactions");
    expect(supabaseInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        church_id: "church-1",
        profile_id: "profile-1",
        feature: "sermon_planning",
        disclaimer_shown: true,
      }),
    );
  });

  it("truncates topic_text to 500 chars when inserting audit row", async () => {
    const longUser = "A".repeat(600);
    await callMinistryAI({ ...PROMPT, user: longUser }, "sermon_planning", "c1", "p1");
    expect(supabaseInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        topic_text: "A".repeat(500),
      }),
    );
  });

  it("calls the gateway as the ministry feature with the prompt and a 2048-token cap", async () => {
    await callMinistryAI(PROMPT, "bible_study", "church-1", "profile-1");
    expect(completeChatMock).toHaveBeenCalledWith({
      feature: "ministry",
      system: PROMPT.system,
      messages: [{ role: "user", content: PROMPT.user }],
      maxTokens: 2048,
      timeoutMs: 50_000,
    });
  });

  it("scrubs PII from topic_text before logging, and sends the gateway the raw text to scrub itself", async () => {
    await callMinistryAI({ ...PROMPT, user: "Note for bob@example.org, call 787-555-0142" }, "sermon_planning", "c", "p");
    expect(supabaseInsertMock).toHaveBeenCalledWith(expect.objectContaining({ topic_text: "Note for [EMAIL], call [PHONE]" }));
  });

  it("passes a 50 s time limit", async () => {
    await callMinistryAI(PROMPT, "bible_study", "c", "p");
    expect(completeChatMock).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 50_000 }));
  });

  it("writes the model, provider, tokens and cost to ai_interactions", async () => {
    await callMinistryAI(PROMPT, "sermon_planning", "church-1", "profile-1");
    expect(supabaseInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model_used: "anthropic/claude-haiku-4.5",
        provider: "openrouter",
        prompt_tokens: 100,
        completion_tokens: 50,
        cost_usd: 0.00035,
      }),
    );
  });

  it("still returns the answer, and logs, when the audit insert fails", async () => {
    supabaseInsertMock.mockResolvedValue({ error: { message: "boom" } } as never);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await callMinistryAI(PROMPT, "sermon_planning", "church-1", "profile-1")).toBe("Here is your outline.");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("propagates a not-configured error without inserting an ai_interactions row", async () => {
    completeChatMock.mockRejectedValue(new Error("AI features are not configured in this environment."));
    await expect(callMinistryAI(PROMPT, "sermon_planning", "church-1", "profile-1")).rejects.toThrow("not configured");
    expect(supabaseInsertMock).not.toHaveBeenCalled();
  });

  it("propagates gateway errors (including empty responses) without inserting a row", async () => {
    completeChatMock.mockRejectedValue(new Error("AI returned an empty response."));
    await expect(callMinistryAI(PROMPT, "sermon_planning", "church-1", "profile-1")).rejects.toThrow("empty response");
    expect(supabaseInsertMock).not.toHaveBeenCalled();
  });
});
