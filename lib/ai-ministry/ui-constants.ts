// Client-safe UI constants for AI ministry features.
// This file intentionally does NOT import server-only so it can be used
// in client components. It is the canonical source for AI_RESPONSE_FOOTER;
// lib/ai-ministry/constants.ts re-exports it from here.
export const AI_RESPONSE_FOOTER =
  "Scripture references should be verified against a Bible before use in ministry.";

export const AI_FEATURES = {
  SERMON_PLANNING: "sermon_planning",
  BIBLE_STUDY: "bible_study",
} as const;

export type AiFeature = (typeof AI_FEATURES)[keyof typeof AI_FEATURES];
