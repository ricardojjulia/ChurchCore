import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { scrubPII } from "./scrub";
import { anthropicModelFor, openRouterModelsFor, type AiGatewayFeature } from "./models";

// The one place a model is called (ADR 0027). OpenRouter first, with a ranked
// model list, a zero-data-retention routing policy and cost in the response;
// direct Anthropic only when no OpenRouter key is set.

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 60_000;

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatCompletion = {
  text: string;
  /** The model that answered (OpenRouter may have fallen back to a later one). */
  model: string;
  provider: "openrouter" | "anthropic";
  usage: { promptTokens: number; completionTokens: number; costUsd: number | null };
};

export type CompleteChat = (request: {
  feature: AiGatewayFeature;
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  signal?: AbortSignal;
  /** Per-call time limit in ms; defaults to 60 s. */
  timeoutMs?: number;
}) => Promise<ChatCompletion>;

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI features are not configured in this environment.");
    this.name = "AiNotConfiguredError";
  }
}

/** A failed provider call. `message` is safe to show; provider text is only logged. */
export class AiProviderError extends Error {
  constructor(
    readonly status: number | null,
    message = "The AI provider request failed.",
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/**
 * What a platform admin or ministry user can act on, for the two provider
 * failures that have a fix. Never provider text; null means "use the generic message".
 */
export function providerFailureMessage(status: number | null): { httpStatus: 502 | 503; message: string } | null {
  if (status === 402) return { httpStatus: 502, message: "AI credits are exhausted. A platform admin needs to top up the AI account." };
  // 503, not 429, so it isn't confused with our own rate limit.
  if (status === 429) return { httpStatus: 503, message: "The AI provider is busy. Try again in a minute." };
  return null;
}

// Every message is scrubbed here so no caller can skip it. The system prompt is ours.
const scrubMessages = (messages: ChatMessage[]): ChatMessage[] =>
  messages.map((message) => ({ ...message, content: scrubPII(message.content) }));

function withTimeout(signal?: AbortSignal, timeoutMs = TIMEOUT_MS): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function viaOpenRouter(apiKey: string, request: Parameters<CompleteChat>[0]): Promise<ChatCompletion> {
  const models = openRouterModelsFor(request.feature);
  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: models[0],
        models,
        messages: [{ role: "system", content: request.system }, ...scrubMessages(request.messages)],
        max_tokens: request.maxTokens,
        // Fail closed: if no zero-data-retention endpoint serves the model the
        // request errors; it is never retried without this policy.
        provider: { zdr: true, data_collection: "deny", allow_fallbacks: true },
      }),
      signal: withTimeout(request.signal, request.timeoutMs),
    });
  } catch (error) {
    console.error("[ai/gateway] openrouter request failed:", error);
    throw new AiProviderError(null);
  }

  let data: Record<string, unknown> | null = null;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = null;
  }

  const errorBody = data && typeof data.error === "object" ? data.error : null;
  if (!response.ok || errorBody) {
    console.error("[ai/gateway] openrouter error:", response.status, errorBody ?? "(no error body)");
    throw new AiProviderError(response.ok ? null : response.status);
  }

  const choices = data?.choices as Array<{ message?: { content?: unknown } }> | undefined;
  const content = choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) throw new AiProviderError(response.status, "AI returned an empty response.");

  const usage = (data?.usage ?? {}) as Record<string, unknown>;
  return {
    text,
    model: typeof data?.model === "string" && data.model ? data.model : models[0],
    provider: "openrouter",
    usage: {
      promptTokens: num(usage.prompt_tokens),
      completionTokens: num(usage.completion_tokens),
      costUsd: typeof usage.cost === "number" && Number.isFinite(usage.cost) ? usage.cost : null,
    },
  };
}

async function viaAnthropic(apiKey: string, request: Parameters<CompleteChat>[0]): Promise<ChatCompletion> {
  const model = anthropicModelFor(request.feature);
  let message: Anthropic.Message;
  try {
    message = await new Anthropic({ apiKey }).messages.create(
      { model, max_tokens: request.maxTokens, system: request.system, messages: scrubMessages(request.messages) },
      { signal: withTimeout(request.signal, request.timeoutMs) },
    );
  } catch (error) {
    console.error("[ai/gateway] anthropic request failed:", error);
    const status = (error as { status?: unknown })?.status;
    throw new AiProviderError(typeof status === "number" ? status : null);
  }

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!text) throw new AiProviderError(200, "AI returned an empty response.");

  return {
    text,
    model: message.model || model,
    provider: "anthropic",
    // The Anthropic API returns tokens but no price.
    usage: { promptTokens: num(message.usage?.input_tokens), completionTokens: num(message.usage?.output_tokens), costUsd: null },
  };
}

export const completeChat: CompleteChat = async (request) => {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) return viaOpenRouter(openRouterKey, request);
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) return viaAnthropic(anthropicKey, request);
  throw new AiNotConfiguredError();
};
