import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────────
const {
  anthropicCreateMock,
  supabaseInsertMock,
  supabaseFromMock,
  createTenantServerClientMock,
} = vi.hoisted(() => {
  const supabaseInsert = vi.fn(async () => ({ error: null }));
  const supabaseFrom = vi.fn(() => ({ insert: supabaseInsert }));
  const createTenantServerClient = vi.fn(async () => ({ from: supabaseFrom }));
  const anthropicCreate = vi.fn();

  return {
    anthropicCreateMock: anthropicCreate,
    supabaseInsertMock: supabaseInsert,
    supabaseFromMock: supabaseFrom,
    createTenantServerClientMock: createTenantServerClient,
  };
});

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: anthropicCreateMock };
    },
  };
});

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
    // Default: API key present
    process.env.ANTHROPIC_API_KEY = "test-key";
    delete process.env.AI_MINISTRY_MODEL;

    // Default: SDK returns a text block
    anthropicCreateMock.mockResolvedValue({
      content: [{ type: "text", text: "Here is your outline." }],
    });

    supabaseInsertMock.mockResolvedValue({ error: null });
    createTenantServerClientMock.mockResolvedValue({ from: supabaseFromMock });
    supabaseFromMock.mockReturnValue({ insert: supabaseInsertMock });
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_MINISTRY_MODEL;
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

  it("uses the model from AI_MINISTRY_MODEL env var when set", async () => {
    process.env.AI_MINISTRY_MODEL = "claude-custom-model";
    await callMinistryAI(PROMPT, "bible_study", "church-1", "profile-1");
    expect(anthropicCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-custom-model" }),
    );
  });

  it("falls back to default model when AI_MINISTRY_MODEL is not set", async () => {
    await callMinistryAI(PROMPT, "sermon_planning", "church-1", "profile-1");
    expect(anthropicCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-5-20251001" }),
    );
  });

  it("throws 'not configured' when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      callMinistryAI(PROMPT, "sermon_planning", "church-1", "profile-1"),
    ).rejects.toThrow("AI features are not configured in this environment.");
  });

  it("does NOT insert an ai_interactions row when API key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      callMinistryAI(PROMPT, "sermon_planning", "church-1", "profile-1"),
    ).rejects.toThrow();
    expect(supabaseInsertMock).not.toHaveBeenCalled();
  });

  it("throws 'empty response' when content array produces no text", async () => {
    anthropicCreateMock.mockResolvedValue({ content: [] });
    await expect(
      callMinistryAI(PROMPT, "sermon_planning", "church-1", "profile-1"),
    ).rejects.toThrow("AI returned an empty response.");
  });

  it("does NOT insert an ai_interactions row when SDK returns empty content", async () => {
    anthropicCreateMock.mockResolvedValue({ content: [] });
    await expect(
      callMinistryAI(PROMPT, "sermon_planning", "church-1", "profile-1"),
    ).rejects.toThrow();
    expect(supabaseInsertMock).not.toHaveBeenCalled();
  });

  it("propagates SDK errors without inserting an ai_interactions row", async () => {
    anthropicCreateMock.mockRejectedValue(new Error("Network timeout"));
    await expect(
      callMinistryAI(PROMPT, "sermon_planning", "church-1", "profile-1"),
    ).rejects.toThrow("Network timeout");
    expect(supabaseInsertMock).not.toHaveBeenCalled();
  });
});
