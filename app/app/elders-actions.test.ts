import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────────
const {
  requireChurchSessionMock,
  callMinistryAIMock,
} = vi.hoisted(() => {
  const requireChurchSession = vi.fn();
  const callMinistryAI = vi.fn();

  return {
    requireChurchSessionMock: requireChurchSession,
    callMinistryAIMock: callMinistryAI,
  };
});

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/ai-ministry/client", () => ({
  callMinistryAI: callMinistryAIMock,
}));

// The prompts and constants modules use `server-only` — already mocked in vitest.setup.ts
vi.mock("@/lib/ai-ministry/prompts", () => ({
  buildSermonOutlinePrompt: vi.fn(() => ({ system: "sys", user: "user" })),
  buildBibleStudyPrompt: vi.fn(() => ({ system: "sys", user: "user" })),
}));

vi.mock("@/lib/ai-ministry/constants", () => ({
  AI_FEATURES: {
    SERMON_PLANNING: "sermon_planning",
    BIBLE_STUDY: "bible_study",
  },
  AI_RESPONSE_FOOTER: "Scripture references should be verified against a Bible before use in ministry.",
  ELDER_AI_DISCLAIMER: "This is an assistive tool only.",
}));

// next/cache — not needed by AI actions but imported by the module
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Tenant client — AI actions don't call it directly (callMinistryAI is mocked)
vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: vi.fn(),
  hasTenantBackendEnv: vi.fn(() => true),
  queryTenantLocalDb: vi.fn(),
  shouldUseLocalTenantFallback: vi.fn(() => false),
}));

// ── Import actions after mocks are set up ─────────────────────────────────────
import {
  generateBibleStudyAnswerAction,
  generateSermonOutlineAction,
} from "@/app/app/elders-actions";

// ── Shared session fixtures ────────────────────────────────────────────────────

const pastorSession = {
  source: "supabase",
  userId: "user-pastor",
  profile: { id: "pastor-profile-1", roleId: "pastor" },
  appContext: {
    kind: "church",
    roleId: "pastor",
    church: { id: "church-abc", name: "Test Church", slug: "test", timezone: "UTC" },
  },
  homePath: "/app/pastor",
  canAccessControl: false,
  memberships: [],
  tenantViews: [],
};

const churchAdminSession = {
  ...pastorSession,
  userId: "user-admin",
  profile: { id: "admin-profile-1", roleId: "church-admin" },
  appContext: {
    ...pastorSession.appContext,
    roleId: "church-admin",
  },
};

const secretarySession = {
  ...pastorSession,
  userId: "user-secretary",
  profile: { id: "sec-profile-1", roleId: "secretary" },
  appContext: {
    ...pastorSession.appContext,
    roleId: "secretary",
  },
};

// ── generateSermonOutlineAction ───────────────────────────────────────────────
describe("generateSermonOutlineAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: pastor session (allowed for council actions too)
    requireChurchSessionMock.mockResolvedValue(pastorSession);
    callMinistryAIMock.mockResolvedValue("Here is a sermon outline.");
  });

  it("returns validation error for unsupported note type without calling SDK", async () => {
    // requireCouncilSession will pass (pastor role)
    const result = await generateSermonOutlineAction({
      noteId: "note-1",
      // @ts-expect-error testing invalid input
      noteType: "council_minutes",
      noteTitle: "Baptism Sunday",
      existingContent: null,
    });
    expect(result).toEqual({
      ok: false,
      error: "AI Suggest is only available for sermon outlines and series plans.",
    });
    expect(callMinistryAIMock).not.toHaveBeenCalled();
  });

  it("returns validation error when noteTitle is empty without calling SDK", async () => {
    const result = await generateSermonOutlineAction({
      noteId: "note-1",
      noteType: "sermon_outline",
      noteTitle: "   ",
      existingContent: null,
    });
    expect(result).toEqual({
      ok: false,
      error: "Note title is required to generate suggestions.",
    });
    expect(callMinistryAIMock).not.toHaveBeenCalled();
  });

  it("returns validation error when noteTitle exceeds 300 characters", async () => {
    const result = await generateSermonOutlineAction({
      noteId: "note-1",
      noteType: "sermon_outline",
      noteTitle: "A".repeat(301),
      existingContent: null,
    });
    expect(result).toEqual({ ok: false, error: "Note title is too long." });
    expect(callMinistryAIMock).not.toHaveBeenCalled();
  });

  it("returns ok:true with outline on pastor session", async () => {
    const result = await generateSermonOutlineAction({
      noteId: "note-1",
      noteType: "sermon_outline",
      noteTitle: "Walking by Faith",
      existingContent: null,
    });
    expect(result).toEqual({ ok: true, outline: "Here is a sermon outline." });
  });

  it("returns ok:true with outline on church_admin session", async () => {
    requireChurchSessionMock.mockResolvedValue(churchAdminSession);
    const result = await generateSermonOutlineAction({
      noteId: "note-1",
      noteType: "series_plan",
      noteTitle: "The Psalms",
      existingContent: "Some notes.",
    });
    expect(result).toEqual({ ok: true, outline: "Here is a sermon outline." });
  });

  it("throws for secretary role (requireCouncilSession denies access)", async () => {
    requireChurchSessionMock.mockResolvedValue(secretarySession);
    await expect(
      generateSermonOutlineAction({
        noteId: "note-1",
        noteType: "sermon_outline",
        noteTitle: "Test",
        existingContent: null,
      }),
    ).rejects.toThrow("Pastor Council Forge requires pastor or church-admin access.");
  });

  it("returns ok:false with 'not configured' error when AI throws that message", async () => {
    callMinistryAIMock.mockRejectedValue(
      new Error("AI features are not configured in this environment."),
    );
    const result = await generateSermonOutlineAction({
      noteId: "note-1",
      noteType: "sermon_outline",
      noteTitle: "Grace",
      existingContent: null,
    });
    expect(result).toEqual({
      ok: false,
      error: "AI features are not configured in this environment.",
    });
  });

  it("returns generic unavailable error for other SDK failures", async () => {
    callMinistryAIMock.mockRejectedValue(new Error("Network error"));
    const result = await generateSermonOutlineAction({
      noteId: "note-1",
      noteType: "sermon_outline",
      noteTitle: "Grace",
      existingContent: null,
    });
    expect(result).toEqual({
      ok: false,
      error: "The AI assistant is temporarily unavailable. Please try again.",
    });
  });
});

// ── generateBibleStudyAnswerAction ────────────────────────────────────────────
describe("generateBibleStudyAnswerAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue(pastorSession);
    // Structured response the parser can handle
    callMinistryAIMock.mockResolvedValue(
      `CONTEXT:\nThe passage discusses love.\nKEY THEMES:\n- Love\n- Sacrifice\nAPPLICATION POINTS:\n- Apply daily\nDISCUSSION QUESTIONS:\n- How do you show love?\nScripture references should be verified against a Bible before use in ministry.`,
    );
  });

  it("returns validation error when query is empty", async () => {
    const result = await generateBibleStudyAnswerAction({ query: "   " });
    expect(result).toEqual({ ok: false, error: "Please enter a passage or topic." });
    expect(callMinistryAIMock).not.toHaveBeenCalled();
  });

  it("returns validation error when query exceeds 500 characters", async () => {
    const result = await generateBibleStudyAnswerAction({ query: "Q".repeat(501) });
    expect(result).toEqual({
      ok: false,
      error: "Query is too long. Please limit to 500 characters.",
    });
    expect(callMinistryAIMock).not.toHaveBeenCalled();
  });

  it("returns ok:true with parsed sections on pastor session", async () => {
    const result = await generateBibleStudyAnswerAction({ query: "John 3:16" });
    expect(result).toMatchObject({
      ok: true,
      sections: expect.objectContaining({
        context: expect.any(String),
        keyThemes: expect.any(Array),
        applicationPoints: expect.any(Array),
        discussionQuestions: expect.any(Array),
        footer: "Scripture references should be verified against a Bible before use in ministry.",
      }),
    });
  });

  it("throws for church_admin role (requireElderSession denies pastor-only access)", async () => {
    requireChurchSessionMock.mockResolvedValue(churchAdminSession);
    await expect(
      generateBibleStudyAnswerAction({ query: "Romans 8" }),
    ).rejects.toThrow("Elders Discernment Room requires pastor / elder access.");
  });

  it("returns ok:false with 'not configured' error when AI throws that message", async () => {
    callMinistryAIMock.mockRejectedValue(
      new Error("AI features are not configured in this environment."),
    );
    const result = await generateBibleStudyAnswerAction({ query: "John 1:1" });
    expect(result).toEqual({
      ok: false,
      error: "AI features are not configured in this environment.",
    });
  });

  it("returns generic unavailable error for other SDK failures", async () => {
    callMinistryAIMock.mockRejectedValue(new Error("Timeout"));
    const result = await generateBibleStudyAnswerAction({ query: "Psalm 23" });
    expect(result).toEqual({
      ok: false,
      error: "The AI assistant is temporarily unavailable. Please try again.",
    });
  });
});
