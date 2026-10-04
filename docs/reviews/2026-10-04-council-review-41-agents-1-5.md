# Council Review 41 — Agent reports (S22 OpenRouter AI gateway)

This is a diff-scoped round on `feat/openrouter-gateway-s22` (`5d4c440`) against `main`. Five separate read-only agents each got their verbatim `improve-software.md` prompt with a scope preamble. The reports are condensed below to their findings. The synthesis (`2026-10-04-council-review-41-synthesis.md`) checks every claim against source and lists the six that proved wrong.

## Agent 1 — Data & API

**Verdict:** pass.

**Migration `20261006000000`**
- The new columns on `ai_interactions` and `hq_sessions` are nullable and added with `add column if not exists`.
- The existing RLS policies apply to them.
- The rollback is stated, and the code must be reverted first.

**Usage handling**
- The Council's `sumUsage` sums tokens, ignores null costs, rounds to 6 decimal places, and removes duplicate models and providers.
- The ministry audit insert runs after the call succeeds. An insert error is logged and the answer is still returned.

**Gaps raised**
- Cost is lost when a call fails.
- The direct-Anthropic path records no cost.
- There's no cost dashboard (post-MVP).
- No test covers a real OpenRouter cost from end to end; a staging check is recommended.

**Wrong claim:** that a Council session can mix providers (synthesis #5).

## Agent 2 — Routes & Pages

**Verdict:** pass.

- The `/api/ai` request and response shapes are unchanged in both advisor and council modes.
- Its error statuses are unchanged: 400, 401, 403, 429, 500 and 502.
- Nothing references the removed `DEFAULT_HQ_MODEL` export.
- The manifest entries for `/hq` and `/api/ai` are correct, and the shell navigation is intact.

**Small slip:** it says `ai_interactions` gains five fields; it gains four (synthesis #6).

## Agent 3 — UX & Shell

**Verdict:** ARIA, loading states and empty states pass.

**Findings**
1. **Consent copy names "Anthropic Claude" only** (`components/ai/disclaimer-gate.tsx:73`). Data can now go through OpenRouter, and possibly to Google. → *fix 2*
2. **Every provider failure returns the same generic 502**, so running out of credits looks the same as a rate limit or an outage. → *fix 4*
3. **No per-seat progress** while a Council run is pending. → post-MVP
4. **No `error.tsx` under `/hq`** (minor).

**Wrong claim:** that the six calls run in parallel (synthesis #4).

## Agent 4 — Feature & Plan

**Verdict:** the brief is delivered and the branch is ready to merge. Readiness holds at 84.

- **Model registry:** quality goes where it matters (Opus for synthesis) and cost where it doesn't (Haiku and Flash for ministry).
- **Evaluation harness outline (post-MVP):**
  - per-feature golden sets with rubrics;
  - quality and cost scoring across candidate models;
  - the cheapest model that meets the bar becomes the registry pick;
  - regression re-scoring when models change;
  - a production feedback loop.

**Wrong or unsupported claims:** that PII is scrubbed before every call (synthesis #1), and an unsourced competitor claim (synthesis #2).

## Agent 5 — Security

**Verdict:** authorization, tenancy, RLS and secrets pass. The ZDR policy is always sent and fails closed.

**Findings**
1. **The ministry AI doesn't scrub PII** (`app/app/elders-actions.ts:646, 696`), rated High. → *fix 1*, which centralises the scrub in the gateway instead of the agent's proposed import from a route module.
2. **Consent copy doesn't name OpenRouter**, rated Medium. → *fix 2*
3. **`console.error` logs OpenRouter error bodies** server-side, rated Low. Accepted: they're server logs only.

**Wrong claim:** that no consent gate runs before a call (synthesis #3).
