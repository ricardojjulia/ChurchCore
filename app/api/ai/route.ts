import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ADVISOR_SYSTEM_PROMPT } from "@/lib/council/seats";
import { runCouncil } from "@/lib/council/run";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Project HQ's model. AI_MINISTRY_MODEL used to double as this, with a
// retired default; HQ now has its own setting (Council v2, improve-software.md §6).
export const DEFAULT_HQ_MODEL = "claude-sonnet-5";
const MAX_PROMPT_CHARS = 8000;
const REGISTER_ROWS = 25;

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * HQ's register (open tasks, risks, decisions) as plain text, PII-scrubbed,
 * so the advisor and the Council answer about this project rather than in
 * the abstract. Read as the caller, so RLS still applies.
 */
export async function loadHqRegister(supabase: ServerClient): Promise<string> {
  const [tasks, risks, decisions] = await Promise.all([
    supabase.from("hq_tasks").select("title, status, owner, priority").neq("status", "done").order("created_at", { ascending: false }).limit(REGISTER_ROWS),
    supabase.from("hq_risks").select("title, mitigation, severity, probability, owner").order("created_at", { ascending: false }).limit(REGISTER_ROWS),
    supabase.from("hq_decisions").select("title, owner, status, impact").order("created_at", { ascending: false }).limit(REGISTER_ROWS),
  ]);
  const lines = (label: string, rows: Array<Record<string, unknown>> | null, error: unknown) => {
    if (error) return `${label}: (couldn't be loaded)`;
    if (!rows?.length) return `${label}: none recorded`;
    return `${label}:\n${rows
      .map((row) => `- ${Object.entries(row).filter(([, value]) => value !== null && value !== "").map(([key, value]) => `${key}: ${value}`).join("; ")}`)
      .join("\n")}`;
  };
  return scrubPII(
    [
      lines("Open tasks", tasks.data, tasks.error),
      lines("Risks", risks.data, risks.error),
      lines("Decisions", decisions.data, decisions.error),
    ].join("\n\n"),
  );
}

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

  // The HQ advisor serves Project HQ, which is platform staff only (S5):
  // without this any signed-in member could spend the AI budget, and its
  // hq_sessions log is platform-admin only anyway (Council Review 27).
  const { data: isPlatformAdmin, error: roleError } = await supabase.rpc("is_platform_admin");
  if (roleError || isPlatformAdmin !== true) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI features are not configured in this environment." },
      { status: 500 }
    );
  }

  let body: { prompt?: unknown; mode?: unknown; agentId?: unknown; agentName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { prompt } = body;
  const mode = body.mode === "council" ? "council" : "advisor";
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return NextResponse.json({ error: `Prompt is limited to ${MAX_PROMPT_CHARS} characters` }, { status: 400 });
  }

  try {
    const scrubbedPrompt = scrubPII(prompt);
    const model = process.env.AI_HQ_MODEL || DEFAULT_HQ_MODEL;
    const client = new Anthropic({ apiKey });
    const register = await loadHqRegister(supabase);

    let responseText: string;
    let payload: Record<string, unknown>;
    if (mode === "council") {
      const run = await runCouncil({ client, model, proposal: scrubbedPrompt, register });
      responseText = [
        run.synthesis,
        ...run.seats.map((seat) => `=== ${seat.name} ===\n${seat.review}`),
      ].join("\n\n");
      payload = { mode, status: run.status, synthesis: run.synthesis, seats: run.seats };
    } else {
      const message = await client.messages.create({
        model,
        max_tokens: 1524,
        system: ADVISOR_SYSTEM_PROMPT,
        messages: [{ role: "user", content: `${scrubbedPrompt}\n\nHQ REGISTER (context):\n${register}` }],
      });
      responseText = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      payload = { mode, response: responseText };
    }

    const { error: insertError } = await supabase
      .from("hq_sessions")
      .insert({
        user_id: user.id,
        agent_id: mode === "council" ? "hq-council" : typeof body.agentId === "string" && body.agentId ? body.agentId : "hq-governance",
        agent_name: mode === "council" ? "HQ Council" : typeof body.agentName === "string" && body.agentName ? body.agentName : "HQ Governance Advisor",
        prompt: scrubbedPrompt,
        response: responseText,
      });

    if (insertError) {
      console.error("[api/ai] failed to log hq_session:", insertError);
    }

    return NextResponse.json(payload);
  } catch (error) {
    // Provider errors can carry request details; log them, don't return them.
    console.error("[api/ai] error processing request:", error);
    return NextResponse.json({ error: "The AI request failed. Try again." }, { status: 502 });
  }
}
