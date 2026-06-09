import "server-only";

// Re-export from the canonical location so there is a single source of truth.
// ELDER_AI_DISCLAIMER lives in lib/elders-types.ts — do not duplicate it here.
export { ELDER_AI_DISCLAIMER } from "@/lib/elders-types";

export const AI_RESPONSE_FOOTER =
  "Scripture references should be verified against a Bible before use in ministry.";

export const AI_FEATURES = {
  SERMON_PLANNING: "sermon_planning",
  BIBLE_STUDY: "bible_study",
} as const;

export type AiFeature = (typeof AI_FEATURES)[keyof typeof AI_FEATURES];
