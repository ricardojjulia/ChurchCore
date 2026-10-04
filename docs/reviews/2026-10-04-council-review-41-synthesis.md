Status: AMENDED
Date: 2026-10-04
Branch: feat/openrouter-gateway-s22 vs main (5d4c440)
Related: DEVELOPMENT_PLAN §0 row S22 (new Should row); ADR 0027 (supersedes 0008); migration 20261006000000; factory run docs/factory-runs/2026-10-04-s22-openrouter-gateway.md
Tags: ai, privacy, consent, infrastructure
Surfaces: POST /api/ai (unchanged contract); elders AI server actions in app/app/elders-actions.ts (sermon outline, Bible study, via lib/ai-ministry/client.ts); no new pages or routes

# Council Review 41 — Synthesis (S22 OpenRouter AI gateway)

Five separate read-only agents ran (Council v2), and their reports are in `2026-10-04-council-review-41-agents-1-5.md`. This is the first synthesis to use the header block and definition-of-done checklist adopted in #182.

## Status

**AMENDED** — ready once the fixes below land. The owner decides.

**What the branch delivers:**
- Every LLM call goes through one server-only gateway (`lib/ai/gateway.ts`). It sends OpenRouter's documented request with a ranked `models` fallback list and `provider: { zdr: true, data_collection: "deny" }`. It fails closed if no zero-retention endpoint can serve the request.
- Direct Anthropic is the owner-approved backup, used only when no OpenRouter key is set.
- Per-feature model lists live in `lib/ai/models.ts`.
- Tokens, cost, provider and model are logged on `ai_interactions` and `hq_sessions`.

Agent 2 confirms the route and action contracts and the manifest are unchanged.

## Fixes required

1. **The ministry AI sends unscrubbed text to the new processor** (A5 High; found independently by the orchestrator).
   - `app/app/elders-actions.ts:646` sends a council note's title and full `existingContent`, and `:696` sends the Bible-study query, with no PII scrub. Council notes can carry pastoral detail.
   - This predates the branch, but this branch sends that text to a new third party.
   - **Fix:** move `scrubPII` to `lib/ai/scrub.ts`, keeping the route's export as a re-export, and have the gateway scrub every message's content on both paths, so no caller can skip it. Scrub `ai_interactions.topic_text` too.
2. **Consent copy names the wrong processor** (A3, A5).
   - `components/ai/disclaimer-gate.tsx:73` says "This tool uses the Anthropic Claude AI model." `ELDER_AI_DISCLAIMER` (`lib/elders-types.ts`) and `/hq`'s note don't mention routing at all. ADR 0027 says the consent copy should name OpenRouter.
   - **Fix:** say that requests go through OpenRouter to models from Anthropic or Google, with zero data retention, and that names and contact details should be left out.
3. **A Council run can outlive the function** (orchestrator).
   - `/api/ai` sets no `maxDuration`. A Council run is five parallel seats *then* the synthesis, each with a 60 s gateway timeout, so it can take about 120 s.
   - **Fix:** `export const maxDuration = 60` on the route, and a per-call `timeoutMs` in the gateway. Seats get 25 s and the synthesis 25 s; the advisor and ministry calls get 50 s.
4. **All provider failures read the same** (A3).
   - The route returns one generic 502 for every failure.
   - **Fix:** map `AiProviderError.status`:
     - 402 → "AI credits are exhausted; a platform admin needs to top up the account";
     - 429 → "The AI provider is busy; try again in a minute";
     - everything else → the existing generic message.
   - Provider text never reaches the client.

## Consensus

- **Authorization, tenancy and RLS are unchanged and correct** (A1, A2, A5). The new columns are nullable and inherit the existing policies.
- **The OpenRouter request matches the contract verified on 2026-10-04** (A4, A5): `zdr`, `data_collection: "deny"`, `models`, system message first, and usage read from the response.
- **The consent and PII gap on the ministry path** (A3, A5, orchestrator) is fixes 1 and 2.

## Recorded, not fixed

- **The Gemini fallback can return nothing.** Gemini 2.5 Pro counts its reasoning tokens against `max_tokens`, so with a seat's 900-token cap it can come back empty. The gateway treats that as an error, so it fails visibly, and it only matters when Sonnet is down. The post-MVP evaluation harness owns model choice.
- **The legacy `AI_HQ_MODEL` alias also sets the synthesis model** on the direct path, so a deployment that sets it loses Opus there. That's acceptable for a backup path, and it's documented in `.env.example`.
- **The direct path has no cost figure** (A1): the Anthropic API returns tokens but not price. Accepted, per ADR 0027.
- **No live call to OpenRouter has been made.** The request format is checked against the documented contract with fixtures only. The owner's first real call after setting `OPENROUTER_API_KEY` is the live check, and it is recorded as an owner action.
- **No per-seat progress** while a Council run is pending (A3). That's post-MVP.

## Wrong or unsupported agent claims (6)

1. **A4:** "PII scrubbing before any model call (unchanged from pre-S22)". Only `/api/ai` scrubs, and the ministry path never did (fix 1).
2. **A4:** "Planning Center, Breeze, Tithe.ly all use their own LLMs or partner integrations". This is unsourced.
3. **A5:** "No pre-call consent gate exists". `components/ai/disclaimer-gate.tsx` is a pre-call gate; what's wrong is its copy (fix 2). A3 cites it.
4. **A3:** "Council calls 5 seats + synthesis in parallel". The seats run in parallel and the synthesis runs after them (`lib/council/run.ts`). That is exactly why the worst case is about 120 s (fix 3).
5. **A1:** "mixed-provider Council sessions (one seat via direct Anthropic, others via OpenRouter)". This can't happen. `completeChat` picks the path from the environment once per call, and every call in a run sees the same keys.
6. **A2:** "`ai_interactions` gains the same five fields". It gains four; `model_used` already existed.

A5's proposed fix, importing `scrubPII` from a route module into a server action, is replaced by fix 1's shared module.

## Score

MVP readiness **holds at 84/100**. S22 is a Should row and infrastructure, with no Must row and no competitive gap closed (A4).

## Prompt A — Council Review 41 fixes

**Files:**
- `lib/ai/scrub.ts` (new)
- `lib/ai/gateway.ts`
- `app/api/ai/route.ts`
- `lib/council/run.ts`
- `lib/ai-ministry/client.ts`
- `components/ai/disclaimer-gate.tsx`
- `lib/elders-types.ts`
- `app/hq/page.tsx`
- their tests

**Work:** fixes 1–4 above, each with a test.

**Verification:**
- `npx vitest run`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npm run test:surfaces`
- `npm run test:e2e:local -- tests/e2e/api-session-routes.spec.ts`

## Definition of done

- [ ] Unit tests pass (count)
- [ ] Surfaces: `npm run test:surfaces` OK
- [ ] Lint: 0 errors
- [ ] Types: `npx tsc --noEmit` clean
- [ ] Build succeeds
- [ ] E2E: `api-session-routes.spec.ts` passes locally; CI `verify` and 4 `e2e` shards green before merge
- [ ] Migration `20261006000000`:
  - `lint:migrations` passes;
  - it applies to a fresh reset (done by the builder);
  - it is additive and nullable;
  - its rollback is stated;
  - an owner action row is added to apply it to hosted Supabase.
- [ ] Commits verified on GitHub
- [ ] GitHub review comments read, fixed or answered, and threads resolved
- [ ] Documenter close-out committed
