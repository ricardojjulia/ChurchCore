import { describe, expect, it } from "vitest";

import { AI_RESPONSE_FOOTER } from "./constants";
import { buildBibleStudyPrompt, buildSermonOutlinePrompt } from "./prompts";

describe("buildSermonOutlinePrompt", () => {
  it("returns an object with system and user keys", () => {
    const result = buildSermonOutlinePrompt("sermon_outline", "Grace and Truth", null);
    expect(result).toHaveProperty("system");
    expect(result).toHaveProperty("user");
  });

  it("includes AI_RESPONSE_FOOTER in the system prompt", () => {
    const { system } = buildSermonOutlinePrompt("sermon_outline", "Redemption", null);
    expect(system).toContain(AI_RESPONSE_FOOTER);
  });

  it("sermon_outline user prompt includes 'main points'", () => {
    const { user } = buildSermonOutlinePrompt("sermon_outline", "Faith Alone", null);
    expect(user.toLowerCase()).toContain("main points");
  });

  it("series_plan user prompt includes 'series'", () => {
    const { user } = buildSermonOutlinePrompt("series_plan", "Walking in the Spirit", null);
    expect(user.toLowerCase()).toContain("series");
  });

  it("includes existingContent in user prompt when provided", () => {
    const content = "This is prior content about the sermon.";
    const { user } = buildSermonOutlinePrompt("sermon_outline", "Hope", content);
    expect(user).toContain(content);
  });

  it("does not include 'Existing notes' section when existingContent is null", () => {
    const { user } = buildSermonOutlinePrompt("sermon_outline", "Hope", null);
    expect(user).not.toContain("Existing notes to build on");
  });

  it("series_plan user prompt does not mention '3 main points'", () => {
    const { user } = buildSermonOutlinePrompt("series_plan", "Kingdom Living", null);
    expect(user).not.toContain("3 main points");
  });

  it("system prompt contains the ELDER_AI_DISCLAIMER text", () => {
    const { system } = buildSermonOutlinePrompt("sermon_outline", "Test", null);
    // Confirm the disclaimer phrase is present
    expect(system).toContain("assistive tool only");
  });

  it("note title appears in user prompt", () => {
    const title = "The Beatitudes and Kingdom Life";
    const { user } = buildSermonOutlinePrompt("sermon_outline", title, null);
    expect(user).toContain(title);
  });
});

describe("buildBibleStudyPrompt", () => {
  it("returns an object with system and user keys", () => {
    const result = buildBibleStudyPrompt("John 3:16");
    expect(result).toHaveProperty("system");
    expect(result).toHaveProperty("user");
  });

  it("system prompt includes CONTEXT: header", () => {
    const { system } = buildBibleStudyPrompt("Romans 8");
    expect(system).toContain("CONTEXT:");
  });

  it("system prompt includes KEY THEMES: header", () => {
    const { system } = buildBibleStudyPrompt("Romans 8");
    expect(system).toContain("KEY THEMES:");
  });

  it("system prompt includes APPLICATION POINTS: header", () => {
    const { system } = buildBibleStudyPrompt("Romans 8");
    expect(system).toContain("APPLICATION POINTS:");
  });

  it("system prompt includes DISCUSSION QUESTIONS: header", () => {
    const { system } = buildBibleStudyPrompt("Romans 8");
    expect(system).toContain("DISCUSSION QUESTIONS:");
  });

  it("system prompt includes AI_RESPONSE_FOOTER", () => {
    const { system } = buildBibleStudyPrompt("Psalm 23");
    expect(system).toContain(AI_RESPONSE_FOOTER);
  });

  it("user prompt includes the query text", () => {
    const query = "The parable of the prodigal son";
    const { user } = buildBibleStudyPrompt(query);
    expect(user).toContain(query);
  });

  it("system prompt restricts to approved translations", () => {
    const { system } = buildBibleStudyPrompt("Genesis 1");
    expect(system).toContain("ESV");
    expect(system).toContain("NIV");
    expect(system).toContain("KJV");
    expect(system).toContain("NRSV");
  });
});
