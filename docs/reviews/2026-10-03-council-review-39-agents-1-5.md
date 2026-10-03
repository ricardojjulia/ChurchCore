# Council Review 39 — Agent reports (Council v2: five audit seats)

Five separate read-only `codebase-researcher` agents ran in parallel, each with its own brief, against `feat/council-v2-hq-llm` (commit d8c03f3) vs `main`. The reports below are condensed to their findings and evidence. The synthesis says which claims were verified, fixed, or rejected.

## Agent 1 — Data & API

- **"Critical": `hq_sessions` is own-sessions-only** (`20260930010000:152–155`), so the page can't show other admins' sessions. Proposed a read-all policy for admins. *(Rejected as a defect: this is the deliberate S5 policy.)*
- **"High": `DEFAULT_HQ_MODEL = "claude-sonnet-5"` "may not be a valid model"**; tests mock the call. *(Rejected: it's a current model id.)*
- **Medium: the Council response's shape isn't asserted** (the synthesis, and each seat's review and recommendation). *(Fixed.)*
- **Verified OK:**
  - the `loadHqRegister` columns and filters match the schema;
  - the `hq_sessions` insert satisfies RLS;
  - `Promise.all` fails closed with a 502, with no partial results;
  - provider errors aren't returned.

## Agent 2 — Routes & Pages

- **Medium: `/control/launch-checklist` builds its own `navItems` without the HQ link.** *(Fixed.)*
- **Claimed: "the control-plane session carries to `/hq` via the same cookies"**, so the manifest note and the "(church-app sign-in)" label are inaccurate. *(Rejected: separate Supabase projects mean separate auth cookies.)*
- **Low: the page-role sweep doesn't exercise `platformAdminOnly`.** *(Existing coverage design: since S5, no sweep identity is a platform admin. Not changed by this branch.)*
- **Verified OK:** the AI tab journeys work: advisor, Council, placeholder templates that prefill, API error toast, mode switch, history selection. The `/api/ai` manifest entry and its 401/403 e2e are accurate.

## Agent 3 — UX & Shell

- **High: no announcement or scroll when a Council result arrives after a long wait.** *(Fixed: an `aria-live` status region plus `scrollIntoView`.)*
- **Medium: "No PII is stored" is misleading.** *(Fixed: the copy now says what is and isn't scrubbed.)*
- **The textarea has no max height; a double submit is possible before re-render.** *(Fixed: autosize capped at 12 rows, plus an in-flight ref guard.)*
- **"Critical": the HQ dashboard card gradients are `rgba()` literals.** *(Pre-existing, within the ratchet allowance; out of scope.)*
- **Verified OK:**
  - the aria-labels on the mode switch and textarea;
  - status shown as text, not only colour;
  - the badge contrast;
  - seat cards stack at phone width;
  - long reviews wrap.

## Agent 4 — Feature & Plan

- **All four suggestions are implemented consistently** across `improve-software.md`, `AGENTS.md`, the three skills and the Documenter, with no stale "four agents" wording on the branch. Reviews 28–37 correctly keep `agents-1-4` names for their own rounds.
- **"High": the portable doc's platform-admin-only RLS contradicts the original admin/manager/teacher policies.** *(Rejected: superseded by migration 20260930010000.)*
- **Medium: record the Council v2 adoption in `DEVELOPMENT_PLAN.md` history.** *(Documenter.)*
- **Claimed: the in-app Council's limits aren't shown in the UI.** *(Rejected: both the mode description and the synthesis card state them.)*
- **No effect on the Nov 6 schedule.**

## Agent 5 — Security

- **Authorization PASS.**
  - The platform-admin gate runs before the register load and before any model call, in both modes.
  - The layout gate and RLS add depth.
- **Error leakage PASS.** It returns a generic 502.
- **`server-only` PASS.** `lib/council/run.ts` is server-only, and `seats.ts` is data only.
- **High: no rate limit on a six-call endpoint.** *(Fixed: 3 Council runs and 10 advisor questions per person per minute.)*
- **Low: the caller-supplied `agentId`/`agentName` are logged unvalidated.** *(Fixed: derived from the mode.)*
- **Medium: prompt injection via register free text.** The model has no tools and the output is advisory. *(Accepted risk, documented.)*
- **Medium: TOCTOU between the role check and the register load.** *(Rejected: RLS re-checks on every read.)*
- **Low-Medium: clarify the `hq_sessions` own-only intent.** *(Documented in the portable doc.)*
- **Recommendation: AMENDED.**
