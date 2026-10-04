import "server-only";

import { completeChat } from "@/lib/ai/gateway";
import { scrubPII } from "@/lib/ai/scrub";
import { createTenantServerClient } from "@/lib/supabase/tenant";
import { type AiFeature } from "./constants";

export async function callMinistryAI(
  prompt: { system: string; user: string },
  feature: AiFeature,
  churchId: string,
  profileId: string,
): Promise<string> {
  // Throws AiNotConfiguredError ("...not configured...") or AiProviderError
  // (safe message); callers map both to a generic user-facing error.
  const completion = await completeChat({
    feature: "ministry",
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
    maxTokens: 1024,
    timeoutMs: 50_000,
  });

  // Audit log — written AFTER a successful API call so failures leave no orphan rows.
  const supabase = await createTenantServerClient();
  const { error } = await supabase.from("ai_interactions").insert({
    church_id: churchId,
    profile_id: profileId,
    feature,
    topic_text: scrubPII(prompt.user).slice(0, 500),
    disclaimer_shown: true,
    model_used: completion.model,
    provider: completion.provider,
    prompt_tokens: completion.usage.promptTokens,
    completion_tokens: completion.usage.completionTokens,
    cost_usd: completion.usage.costUsd,
  });
  if (error) {
    // The answer was produced and paid for; don't withhold it over a log failure.
    console.error("[ai-ministry] failed to log ai_interaction:", error);
  }

  return completion.text;
}
