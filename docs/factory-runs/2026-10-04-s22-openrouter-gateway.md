# Factory run: S22 — OpenRouter AI gateway (2026-10-04)

**Branch:** `feat/openrouter-gateway-s22`. This is a new Should row, S22, added by owner decision on 2026-10-04: "Gateway now, rest after MVP".

## Owner decisions (2026-10-04)

- **All LLM calls go through OpenRouter.** The gateway applies per-feature ranked model lists, logs cost, and uses a zero-data-retention policy.
- **Direct Anthropic stays as a backup.** When `OPENROUTER_API_KEY` is unset and `ANTHROPIC_API_KEY` is set, calls go directly to Anthropic with the feature's Anthropic model id. The direct path has no cross-vendor fallback and no cost figure, because the Anthropic API returns tokens but not price.
- **Deferred to after the MVP**, as new plan rows:
  - an evaluation harness: per-feature golden sets, scoring candidate models on quality and cost, and picking the cheapest that meets the bar;
  - LLM-driven ShepherdAI, covering **scoring as well as drafts**, gated on explicit AI consent and a privacy note, since member engagement data would go to a third party.
- **These stay deterministic, by design:** authorization, RLS and tenancy, consent gates, PII scrubbing before any model call, audit logging, child safety, and money/ledger.

## OpenRouter contract (verified against openrouter.ai/docs on 2026-10-04, not from memory)

- **Request:** `POST https://openrouter.ai/api/v1/chat/completions`, with `Authorization: Bearer <OPENROUTER_API_KEY>` and `Content-Type: application/json`. Error bodies have the shape `{ "error": { "code", "message", "metadata" } }`.
- **Body fields we use:**
  - `model`, the primary model;
  - `models`, an array of model ids in priority order (any error on one tries the next; the response `model` field names the model that answered, and billing follows it);
  - `messages` (`[{ role: "system" | "user" | "assistant", content }]`);
  - `max_tokens`.
- **The `provider` object:** `{ "zdr": true, "data_collection": "deny", "allow_fallbacks": true }`. `data_collection` defaults to `"allow"`, and `zdr` restricts routing to zero-data-retention endpoints. If no endpoint qualifies, the request errors and we **fail closed**; we never retry without the policy.
- **Usage is always included in the response** (`usage: { include: true }` is deprecated): `usage.prompt_tokens`, `usage.completion_tokens`, `usage.total_tokens` and `usage.cost` (credits charged).
- **Responses:** the text is at `choices[0].message.content`. Error statuses are 400, 401, 402 (out of credits), 403 (guardrail), 429, 500 and 503.
- **Model ids** (from `GET /api/v1/models`, 2026-10-04, prices per token):

  | Model | Input | Output | Context |
  |---|---|---|---|
  | `anthropic/claude-sonnet-5.5` | $0.000002 | $0.00001 | 1M |
  | `anthropic/claude-opus-5.5` | $0.000004 | $0.00002 | 1M |
  | `anthropic/claude-haiku-4.5` | $0.000001 | $0.000005 | 200k |
  | `google/gemini-2.5-pro` | $0.00000125 | $0.00001 | 1M |
  | `google/gemini-2.5-flash` | $0.0000003 | $0.0000025 | 1M |

## Brief (approved)

1. **`lib/ai/gateway.ts`** (`import "server-only"`):
   - Exports `completeChat({ feature, system, messages, maxTokens, signal? })`, which returns `{ text, model, provider: "openrouter" | "anthropic", usage: { promptTokens, completionTokens, costUsd: number | null } }`.
   - Uses `fetch` against OpenRouter (no new SDK). The fallback is the existing `@anthropic-ai/sdk`.
   - A timeout through `AbortSignal.timeout`.
   - Typed errors: `AiNotConfiguredError` (neither key set), and `AiProviderError` with status and a safe message. Provider error text is logged server-side and never returned to callers.
   - An empty response is an error.
2. **`lib/ai/models.ts`** holds the feature registry. Each feature has an ordered OpenRouter model list and its Anthropic direct model id. `AI_MODELS_<FEATURE>` (a comma list) overrides the OpenRouter list and `AI_ANTHROPIC_MODEL_<FEATURE>` overrides the direct id. The existing `AI_HQ_MODEL` and `AI_MINISTRY_MODEL` stay honoured as aliases for the direct path, with a note.

   | Feature | OpenRouter models | Direct Anthropic |
   |---|---|---|
   | `hq-advisor` | sonnet-5.5, gemini-2.5-pro | `claude-sonnet-5-5` |
   | `hq-council-seat` | sonnet-5.5, gemini-2.5-pro | `claude-sonnet-5-5` |
   | `hq-council-synthesis` | opus-5.5, sonnet-5.5 | `claude-opus-5-5` |
   | `ministry` | haiku-4.5, gemini-2.5-flash | `claude-haiku-4-5-20251001` |

   The builder must confirm the direct ids against the Anthropic models list it can reach. If it can't, it keeps the ids the code uses today and says so.
3. **Call sites:** `app/api/ai/route.ts` (advisor), `lib/council/run.ts` (its seats and synthesis take a gateway function instead of an SDK client) and `lib/ai-ministry/client.ts` all go through `completeChat`. Their behaviour, errors and existing tests' intent are preserved.
4. **Additive migration `20261006000000_ai_usage_cost.sql`:**
   - `ai_interactions` gets `prompt_tokens int`, `completion_tokens int`, `cost_usd numeric(12,6)` and `provider text`, all nullable.
   - `hq_sessions` gets `model_used text`, `prompt_tokens int`, `completion_tokens int`, `cost_usd numeric(12,6)` and `provider text`, all nullable.
   - A Council session stores the summed tokens and cost, and `model_used` lists the distinct models.
   - The rollback is stated in the migration.
   - The `ai_interactions` insert error is checked and logged; the answer is still returned.
5. **ADR 0027** (`docs/adr/0027-openrouter-ai-gateway.md`) supersedes ADR 0008, which is marked superseded.
6. **`.env.example`:** `OPENROUTER_API_KEY` and the override variables, documented.
7. **Tests:**
   - The gateway: the exact URL, method, headers and body (`model`, `models`, `provider.zdr === true`, `provider.data_collection === "deny"`, `max_tokens`, messages with system first).
   - Response parsing, using a fixture shaped like the documented response, including `usage.cost` and the answering `model`.
   - Error mapping (402, 429, 5xx, the `{error}` body), and no provider text in thrown messages.
   - A timeout.
   - The direct-Anthropic fallback used only when the OpenRouter key is absent.
   - The not-configured error.
   - Updated route, council and ministry tests.
   - Cost columns written.

## Council and verification (added by the Documenter, 2026-10-04)

**Intent.** Route every LLM call through one OpenRouter gateway with per-feature ranked model fallbacks, zero-data-retention routing and cost logging, keeping direct Anthropic as a backup (owner decision 2026-10-04).

**Architecture impact.** New server-only `lib/ai/gateway.ts`, `lib/ai/models.ts` and `lib/ai/scrub.ts`; the HQ advisor route, `runCouncil` and the ministry client now call `completeChat`. Additive migration `20261006000000` adds nullable usage and cost columns. ADR 0027 supersedes ADR 0008. No new pages, routes or server actions, so `tests/coverage-manifest.json` is unchanged. OpenRouter is a new sub-processor.

**Council Review 41** (`docs/reviews/2026-10-04-council-review-41-synthesis.md`, agent reports in `...-agents-1-5.md`, status AMENDED, all four required fixes landed in `2137fd1`):
1. The ministry AI sent unscrubbed text to the new processor (A5 High, also found by the orchestrator): `scrubPII` moved to `lib/ai/scrub.ts` and runs inside the gateway on every message on both paths; ministry `topic_text` scrubbed.
2. Consent copy named the wrong processor: new `AI_DATA_ROUTING_NOTICE` shown in `components/ai/disclaimer-gate.tsx`; `/hq` note updated; `ELDER_AI_DISCLAIMER` kept pastoral-only.
3. A Council run could outlive the function: `maxDuration = 60` on `/api/ai`, per-call `timeoutMs` (seats and synthesis 25 s, advisor and ministry 50 s).
4. Every provider failure read the same: 402 maps to "AI credits are exhausted" and 429 to "The AI provider is busy"; provider text never reaches the client.
Six agent claims were wrong or unsupported (listed in the synthesis and the changelog).

**Verification (orchestrator-run, after `2137fd1`).** `npx vitest run` 200 files / 2,438 tests pass; `npm run lint` 0 errors (1 pre-existing warning); `npx tsc --noEmit` clean; `npm run test:surfaces` OK; `npm run build` compiled; `npm run test:e2e:local -- tests/e2e/api-session-routes.spec.ts` 43 passed. Builder (earlier, same migration): `npm run lint:migrations` PASS; `npm run setup:e2e -- --reset` applied all migrations including `20261006000000`; the column-references DB test passed. **Not done:** no live call to OpenRouter (contract checked against its documentation with fixtures only); CI has not run (no PR yet); commit signatures not yet checked on GitHub.

**Residual risk.**
- The OpenRouter wire format is unproven against the live service until owner action O9.
- The Gemini 2.5 Pro fallback may return an empty reply under a 900-token cap (it counts reasoning tokens), which fails visibly.
- The legacy `AI_HQ_MODEL` alias also sets the synthesis model on the direct path.
- The direct path logs no cost.
- No per-seat progress during a Council run.
- ZDR can leave a ranked model with no eligible endpoint, in which case that request fails rather than weakening privacy.

**Follow-up work.**
- O9: set `OPENROUTER_API_KEY` in Vercel (keep `ANTHROPIC_API_KEY` as backup), make one live call from `/hq`, confirm `hq_sessions.cost_usd` is filled.
- O10: apply migration `20261006000000` to hosted Supabase after merge (rollback is in the migration).
- Post-MVP rows (DEVELOPMENT_PLAN §0.5): the AI model evaluation harness; LLM-driven ShepherdAI scoring and drafts, gated on an explicit AI-consent decision and privacy note.
