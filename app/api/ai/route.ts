import { NextRequest, NextResponse } from "next/server";
import { AiProviderError, completeChat, isAiConfigured, providerFailureMessage, type ChatCompletion } from "@/lib/ai/gateway";
import { scrubPII } from "@/lib/ai/scrub";
import { ADVISOR_SYSTEM_PROMPT } from "@/lib/council/seats";
import { runCouncil } from "@/lib/council/run";
import { isRateLimited } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
// A Council run is five parallel seats then a synthesis (25 s cap each, see lib/council/run.ts).
export const maxDuration = 60;

// Models come from the gateway's feature registry (lib/ai/models.ts, ADR 0027).
const MAX_PROMPT_CHARS = 8000;
const REGISTER_ROWS = 25;
// Per person per minute. A Council run is six model calls (Council Review 39).
const PER_MINUTE = { advisor: 10, council: 3 } as const;

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * HQ's register (open tasks, risks, decisions) as plain text, so the advisor
 * and the Council answer about this project rather than in the abstract.
 * Read as the caller, so RLS still applies. Only titles and structured
 * fields are sent: owners and mitigation notes are free text about people,
 * so they stay out (data minimization, DEVELOPMENT_PLAN.md §7). Titles are
 * still scrubbed.
 */
export async function loadHqRegister(supabase: ServerClient): Promise<string> {
  const [tasks, risks, decisions] = await Promise.all([
    supabase.from("hq_tasks").select("title, status, priority").neq("status", "done").order("created_at", { ascending: false }).limit(REGISTER_ROWS),
    supabase.from("hq_risks").select("title, severity, probability").order("created_at", { ascending: false }).limit(REGISTER_ROWS),
    supabase.from("hq_decisions").select("title, status, impact").order("created_at", { ascending: false }).limit(REGISTER_ROWS),
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

export { scrubPII };

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

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI features are not configured in this environment." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Expected a JSON object" }, { status: 400 });
  }
  const { prompt, mode: requestedMode } = body as { prompt?: unknown; mode?: unknown };
  if (requestedMode !== undefined && requestedMode !== "advisor" && requestedMode !== "council") {
    return NextResponse.json({ error: 'mode must be "advisor" or "council"' }, { status: 400 });
  }
  const mode = requestedMode === "council" ? "council" : "advisor";
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return NextResponse.json({ error: `Prompt is limited to ${MAX_PROMPT_CHARS} characters` }, { status: 400 });
  }
  if (isRateLimited(`api-ai:${mode}:${user.id}`, PER_MINUTE[mode])) {
    return NextResponse.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429 });
  }

  try {
    const scrubbedPrompt = scrubPII(prompt);
    const register = await loadHqRegister(supabase);

    let responseText: string;
    let payload: Record<string, unknown>;
    let usage: ChatCompletion["usage"] & { models: string[]; providers: string[] };
    if (mode === "council") {
      const run = await runCouncil({ complete: completeChat, proposal: scrubbedPrompt, register });
      responseText = [
        run.synthesis,
        ...run.seats.map((seat) => `=== ${seat.name} ===\n${seat.review}`),
      ].join("\n\n");
      payload = { mode, status: run.status, synthesis: run.synthesis, seats: run.seats };
      usage = run.usage;
    } else {
      const completion = await completeChat({
        feature: "hq-advisor",
        // 1,524 truncated real answers (the first live call stopped exactly at
        // the cap). 3,000 fits inside maxDuration = 60 at typical Sonnet speed.
        maxTokens: 3000,
        timeoutMs: 55_000,
        system: ADVISOR_SYSTEM_PROMPT,
        messages: [{ role: "user", content: `${scrubbedPrompt}\n\nHQ REGISTER (context):\n${register}` }],
      });
      responseText = completion.text;
      payload = { mode, response: responseText };
      usage = { ...completion.usage, models: [completion.model], providers: [completion.provider] };
    }

    const { error: insertError } = await supabase
      .from("hq_sessions")
      .insert({
        user_id: user.id,
        // Set by the mode, never by the caller, so the log says what actually ran.
        agent_id: mode === "council" ? "hq-council" : "hq-governance",
        agent_name: mode === "council" ? "HQ Council" : "HQ Governance Advisor",
        prompt: scrubbedPrompt,
        response: responseText,
        model_used: usage.models.join(", "),
        provider: usage.providers.join(", "),
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        cost_usd: usage.costUsd,
      });

    if (insertError) {
      console.error("[api/ai] failed to log hq_session:", insertError);
    }

    return NextResponse.json(payload);
  } catch (error) {
    // Provider errors can carry request details; log them, don't return them.
    console.error("[api/ai] error processing request:", error);
    if (error instanceof AiProviderError) {
      const friendly = providerFailureMessage(error.status);
      if (friendly) return NextResponse.json({ error: friendly.message }, { status: friendly.httpStatus });
    }
    return NextResponse.json({ error: "The AI request failed. Try again." }, { status: 502 });
  }
}
