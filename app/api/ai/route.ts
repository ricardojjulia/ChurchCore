import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export function scrubPII(text: string): string {
  if (!text) return "";
  
  // 1. Scrub email addresses. Quantifiers are bounded (RFC 5321-ish limits)
  // rather than unbounded `+` to avoid polynomial backtracking (ReDoS) on
  // adversarial input -- this runs on user-controlled prompt text.
  let scrubbed = text.replace(
    /[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,255}\.[a-zA-Z]{2,24}/g,
    "[EMAIL]"
  );

  // 2. Scrub UUIDs (typically matches user_id, auth_id, record IDs)
  scrubbed = scrubbed.replace(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
    "[ID]"
  );

  return scrubbed;
}

export async function POST(request: NextRequest): Promise<Response> {
  const supabase = await createClient("tenant");
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI features are not configured in this environment." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { prompt, agentId, agentName } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const scrubbedPrompt = scrubPII(prompt);

    const model = process.env.AI_MINISTRY_MODEL ?? "claude-3-5-sonnet-20241022";
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model,
      max_tokens: 1524,
      system: "You are the ChurchCore Project HQ AI Governance Advisor. Help the administrator or manager analyze project governance data, tasks, risks, and decisions. Offer professional, structured guidance. Keep answers direct and do not display any raw IDs or emails.",
      messages: [{ role: "user", content: scrubbedPrompt }],
    });

    const responseText = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("\n");

    // Insert interaction session log
    const { error: insertError } = await supabase
      .from("hq_sessions")
      .insert({
        user_id: user.id,
        agent_id: agentId || "hq-governance",
        agent_name: agentName || "HQ Governance Advisor",
        prompt: scrubbedPrompt,
        response: responseText,
      });

    if (insertError) {
      console.error("[api/ai] failed to log hq_session:", insertError);
    }

    return NextResponse.json({ response: responseText });
  } catch (error) {
    console.error("[api/ai] error processing request:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
