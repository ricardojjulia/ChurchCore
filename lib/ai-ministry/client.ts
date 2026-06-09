import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { createTenantServerClient } from "@/lib/supabase/tenant";
import { type AiFeature } from "./constants";

export async function callMinistryAI(
  prompt: { system: string; user: string },
  feature: AiFeature,
  churchId: string,
  profileId: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("AI features are not configured in this environment.");
  }

  const model = process.env.AI_MINISTRY_MODEL ?? "claude-haiku-4-5-20251001";

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
  });

  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { type: "text"; text: string }).text)
    .join("\n");

  if (!text) {
    throw new Error("AI returned an empty response.");
  }

  // Audit log — written AFTER a successful API call so failures leave no orphan rows.
  const supabase = await createTenantServerClient();
  await supabase.from("ai_interactions").insert({
    church_id: churchId,
    profile_id: profileId,
    feature,
    topic_text: prompt.user.slice(0, 500),
    disclaimer_shown: true,
    model_used: model,
  });

  return text;
}
