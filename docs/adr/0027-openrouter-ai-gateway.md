# ADR 0027: OpenRouter AI gateway

- Status: Accepted
- Date: 2026-10-04
- Deciders: Ricardo Julia
- Supersedes: ADR 0008

## Context

ADR 0008 put every LLM call behind the Anthropic SDK, one model per call site, with no cost visibility. Three call sites had grown (the Project HQ advisor, the in-app Council's five seats plus synthesis, and the ministry tools), each constructing its own client and choosing its own model. Owner decision 2026-10-04: all LLM calls go through OpenRouter with per-feature ranked model lists, cost logging and zero data retention; direct Anthropic stays as a backup.

## Decision

- `lib/ai/gateway.ts` (server-only) exports `completeChat({ feature, system, messages, maxTokens, signal? })`, returning `{ text, model, provider, usage: { promptTokens, completionTokens, costUsd } }`. It is the only module that calls a model.
- **OpenRouter** (`OPENROUTER_API_KEY`) is primary, via `fetch` to `POST https://openrouter.ai/api/v1/chat/completions` (no new dependency). The body carries `model`, the ranked `models` list, `messages` (system first), `max_tokens` and `provider: { zdr: true, data_collection: "deny", allow_fallbacks: true }`. If no zero-data-retention endpoint serves the models, the request errors and the gateway fails closed; it never retries without the policy. Usage and `usage.cost` come back on every response and the answering `model` is recorded.
- **Direct Anthropic** (`@anthropic-ai/sdk`, kept) is used only when `OPENROUTER_API_KEY` is unset and `ANTHROPIC_API_KEY` is set. It uses the feature's Anthropic model id, has no cross-vendor fallback, and records tokens with a null cost (the API returns no price).
- `lib/ai/models.ts` is the feature registry: `hq-advisor` and `hq-council-seat` (Sonnet 5.5, then Gemini 2.5 Pro), `hq-council-synthesis` (Opus 5.5, then Sonnet 5.5), `ministry` (Haiku 4.5, then Gemini 2.5 Flash). Direct ids: `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-haiku-4-5-20251001`. `AI_MODELS_<FEATURE>` and `AI_ANTHROPIC_MODEL_<FEATURE>` override; `AI_HQ_MODEL` and `AI_MINISTRY_MODEL` remain aliases for the direct path.
- Errors are typed: `AiNotConfiguredError` and `AiProviderError` (status plus a safe message). Provider error text is logged server-side and never returned. An empty response is an error. Each call has a `timeoutMs` (default 60 s); Council seats and synthesis use 25 s each, the advisor and ministry calls 50 s, and `/api/ai` sets `maxDuration = 60`, because a Council run is five parallel seats then the synthesis and would otherwise outlive the function (Council Review 41). `/api/ai` and the ministry actions map `AiProviderError.status` 402 to "AI credits are exhausted" (HTTP 502) and 429 to "The AI provider is busy" (HTTP 503); provider text still never reaches the client.
- **PII scrubbing lives in the gateway** (`lib/ai/scrub.ts`, re-exported by the `/api/ai` route): `completeChat` scrubs every message's content on both the OpenRouter and direct paths, so no caller can skip it, and the ministry tools' `ai_interactions.topic_text` is scrubbed too. Before Council Review 41 only `/api/ai` scrubbed, and the ministry path sent council notes and Bible-study queries unscrubbed.
- `runCouncil` takes an injected completion function instead of an SDK client; seats stay parallel.
- Migration `20261006000000_ai_usage_cost.sql` adds nullable `provider`, `prompt_tokens`, `completion_tokens`, `cost_usd` to `ai_interactions` and `hq_sessions`, plus `model_used` on `hq_sessions`. A Council session stores the sums over its six calls and the distinct models joined by ", ".

## Consequences

- Model choice and cost are visible per call, and a provider or model outage degrades to the next ranked model instead of failing.
- OpenRouter becomes a sub-processor between ChurchCore and the model vendors. ZDR plus `data_collection: "deny"` constrains routing, and PII scrubbing now runs inside the gateway for every call. The consent copy names OpenRouter: `AI_DATA_ROUTING_NOTICE` (`lib/elders-types.ts`) is shown in `components/ai/disclaimer-gate.tsx`, and `/hq`'s note was updated. It is a separate constant because `ELDER_AI_DISCLAIMER` is also sent in system prompts and appended to saved outputs, so it stays pastoral-only.
- ZDR can shrink the set of eligible endpoints; if a ranked model has none, that request fails rather than weakening privacy.
- Not LLM-driven, by design: authorization, RLS and tenancy, consent gates, PII scrubbing, audit logging, child safety, money and the ledger.
- Known residual risks: no live OpenRouter call has been made (owner action O9 is the live check); the Gemini 2.5 Pro fallback may return an empty reply under a 900-token cap because it counts reasoning tokens (an empty reply is an error, so it fails visibly); the legacy `AI_HQ_MODEL` alias also sets the synthesis model on the direct path; the direct path logs no cost.
- Deferred past the MVP: an evaluation harness (golden sets, quality-per-cost model selection) and LLM-driven ShepherdAI scoring and drafts gated on explicit AI consent.

## Alternatives considered

- Keep the SDK per call site: no cross-vendor fallback and no cost figure.
- The OpenAI SDK or an OpenRouter SDK pointed at OpenRouter: a new dependency for one POST endpoint.
