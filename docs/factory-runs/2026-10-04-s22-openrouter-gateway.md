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
