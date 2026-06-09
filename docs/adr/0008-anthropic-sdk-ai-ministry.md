# ADR 0008: Anthropic SDK for AI Ministry Tools

- Status: Accepted
- Date: 2026-06-08
- Deciders: Ricardo Julia

## Context

CC-AI-001 introduces the first LLM integration in ChurchCore: Sermon Planning outline
generation and Bible Study Q&A for pastor and church-admin users. The feature requires
a reliable, well-maintained client library for calling an external LLM API from
server-side Next.js server actions.

DEVELOPMENT_PLAN.md §4 specifies strong theological guardrails for all AI outputs:
disclaimers on every result, approved Scripture translations only, and full audit logging
of every AI interaction. §6 ("AI: Private LLM endpoints in later sprints") leaves the
provider open; the initial implementation uses Anthropic Claude as the model provider.

## Decision

Use `@anthropic-ai/sdk` (official Anthropic TypeScript SDK, version ^0.102.0) for all
AI Ministry API calls. All calls happen in server-only code (`lib/ai-ministry/`) with
`import 'server-only'` guards. No browser-side LLM calls are permitted.

The default model is `claude-haiku-4-5-20251001` (fast, cost-effective for ministry
drafts), overridable at runtime via the `AI_MINISTRY_MODEL` environment variable.

## Consequences

**Positive**

- Official SDK provides typed responses, automatic retries, and timeout handling without
  custom fetch wrappers.
- Server-only execution keeps the API key and prompt content out of the browser bundle.
- Model is configurable via env var, so production environments can pin to a stable
  version while staging tests newer releases.

**Data and privacy**

- Query text (up to 500 characters of the user prompt) is sent to the Anthropic API and
  is subject to Anthropic's data retention and privacy policies. Church admins should be
  made aware of this in the AI consent flow.
- `ANTHROPIC_API_KEY` must be stored as a secret environment variable in Vercel and must
  never be committed to the repository. If the key is absent, all AI actions return a
  safe "not configured" error rather than an unhandled exception.
- Every successful AI call is audit-logged in `ai_interactions` (church_id, profile_id,
  feature, truncated topic, model used) under the same `can_access_council_data` RLS
  policy used by council notes.

**Risks and mitigations**

- Anthropic API outages cause AI actions to return a "temporarily unavailable" error;
  the rest of the platform is unaffected.
- Model versioning: if Anthropic deprecates the default model, the env var allows a
  zero-deploy switch. A future ADR should document a model-pinning policy for production.
- Token cost: `max_tokens: 1024` is set on all calls to cap per-call cost. Usage-based
  billing tiers from DEVELOPMENT_PLAN.md §1 will govern credits in a future sprint.

## Alternatives considered

- **Direct `fetch` calls**: Rejected. The SDK handles auth headers, error parsing, and
  type safety. No meaningful benefit to bypassing it.
- **OpenAI SDK**: Rejected for this sprint. Anthropic was chosen based on existing
  internal familiarity and the theological guardrail prompt patterns already approved in
  `elders-actions.ts`. This decision can be revisited in a future ADR.
- **Bundling a local model**: Out of scope for Sprint 5. Noted in DEVELOPMENT_PLAN.md
  §6 as a future consideration.
