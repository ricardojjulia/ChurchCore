import "server-only";

// The AI feature registry (ADR 0027). Each feature names an ordered list of
// OpenRouter model ids (the gateway tries them in order) and the model id used
// when calling Anthropic directly (the backup path, no cross-vendor fallback).

export type AiGatewayFeature = "hq-advisor" | "hq-council-seat" | "hq-council-synthesis" | "ministry";

type FeatureConfig = {
  openRouterModels: readonly string[];
  anthropicModel: string;
  /** Pre-gateway env var that still sets the direct Anthropic model. */
  legacyAnthropicEnv: "AI_HQ_MODEL" | "AI_MINISTRY_MODEL";
};

const SONNET = "anthropic/claude-sonnet-5.5";
const OPUS = "anthropic/claude-opus-5.5";
const HAIKU = "anthropic/claude-haiku-4.5";
const GEMINI_PRO = "google/gemini-2.5-pro";
const GEMINI_FLASH = "google/gemini-2.5-flash";

export const AI_FEATURE_MODELS: Record<AiGatewayFeature, FeatureConfig> = {
  "hq-advisor": { openRouterModels: [SONNET, GEMINI_PRO], anthropicModel: "claude-sonnet-5-5", legacyAnthropicEnv: "AI_HQ_MODEL" },
  "hq-council-seat": { openRouterModels: [SONNET, GEMINI_PRO], anthropicModel: "claude-sonnet-5-5", legacyAnthropicEnv: "AI_HQ_MODEL" },
  "hq-council-synthesis": { openRouterModels: [OPUS, SONNET], anthropicModel: "claude-opus-5-5", legacyAnthropicEnv: "AI_HQ_MODEL" },
  ministry: { openRouterModels: [HAIKU, GEMINI_FLASH], anthropicModel: "claude-haiku-4-5-20251001", legacyAnthropicEnv: "AI_MINISTRY_MODEL" },
};

const envSuffix = (feature: AiGatewayFeature) => feature.toUpperCase().replace(/-/g, "_");

/** Ordered OpenRouter model ids; `AI_MODELS_<FEATURE>` (comma list) overrides. */
export function openRouterModelsFor(feature: AiGatewayFeature): string[] {
  const override = (process.env[`AI_MODELS_${envSuffix(feature)}`] ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return override.length ? override : [...AI_FEATURE_MODELS[feature].openRouterModels];
}

/**
 * The direct Anthropic model id. Precedence: `AI_ANTHROPIC_MODEL_<FEATURE>`,
 * then the older `AI_HQ_MODEL` / `AI_MINISTRY_MODEL` (kept as aliases so
 * existing deployments don't change), then the registry default. Empty
 * strings count as unset.
 */
export function anthropicModelFor(feature: AiGatewayFeature): string {
  const config = AI_FEATURE_MODELS[feature];
  return (
    process.env[`AI_ANTHROPIC_MODEL_${envSuffix(feature)}`]?.trim() ||
    process.env[config.legacyAnthropicEnv]?.trim() ||
    config.anthropicModel
  );
}
