import "server-only";

// Re-export from the canonical location so there is a single source of truth.
// ELDER_AI_DISCLAIMER lives in lib/elders-types.ts — do not duplicate it here.
export { ELDER_AI_DISCLAIMER } from "@/lib/elders-types";

// AI_RESPONSE_FOOTER, AI_FEATURES, and AiFeature are defined in ui-constants.ts
// (no server-only) so client components can import them too. Re-export here for
// server-side code that imports from this module.
export { AI_RESPONSE_FOOTER, AI_FEATURES, type AiFeature } from "./ui-constants";
