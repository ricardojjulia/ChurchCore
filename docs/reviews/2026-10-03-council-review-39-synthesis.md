# Council Review 39 — Synthesis (Council v2 and the HQ AI Council)

**Branch:** `feat/council-v2-hq-llm` vs `main`. This is the **first round run under Council v2**: five separate read-only audit agents (Data & API, Routes & Pages, UX & Shell, Feature & Plan, and Security, new this round), then the Documenter. The reports are in `2026-10-03-council-review-39-agents-1-5.md`.

## Status: AMENDED → fixes landed

The branch does what the owner asked:
- **Council v2.** A dedicated Security seat; a migration line in the definition of done; RATIFIED/AMENDED/REJECTED status labels. Applied consistently across `improve-software.md`, `AGENTS.md`, and the Claude, Codex and Gemini council skills.
- **A visible "Project HQ" link** in the control-plane nav.
- **HQ's `/api/ai` on a current model** (`AI_HQ_MODEL`, default `claude-sonnet-5`, replacing the retired `claude-3-5-sonnet-20241022`), with HQ's register as context and a Council mode: five separate seat calls in parallel, then a synthesis.
- **The portable spec** at `docs/council-and-hq-portable.md`.

The Council found six fixable issues. All are fixed in the second commit.

## Fixed after Council

1. **No throttle on a six-call endpoint** (A5 High). `/api/ai` now limits each person per minute, using the repo's existing helper `lib/rate-limit.ts`: 3 Council runs and 10 advisor questions; beyond that it returns 429. A test covers it.
2. **The caller chose the logged agent id and name** (A5). `hq_sessions.agent_id`/`agent_name` now come from the mode only. A test shows a spoofed value is ignored.
3. **`/control/launch-checklist` builds its own nav and had no HQ link** (A2). The link is added.
4. **Results weren't announced** (A3). A Council run takes six calls; its result could land below the fold with no screen-reader announcement. It is now in a `role="status"` `aria-live` region and scrolled into view. There is also a guard against a second submit before the disabled state renders.
5. **"No PII is stored" was untrue** (A3). Only emails and IDs are scrubbed. The note now says so, and asks people to leave names out.
6. **The test didn't check the Council response's shape** (A1). It now checks the synthesis and every seat's `review` and `recommendation`.

The prompt box also autosizes, capped at 12 rows (A3).

## Wrong or unsupported agent claims (7)

1. **A1, "Critical":** "`hq_sessions` RLS hides other admins' sessions from the governance dashboard." Correct as a description, wrong as a defect. Own-sessions-only was the deliberate S5 policy (named "platform admins, own sessions"), and this branch doesn't touch it. Recorded in the portable doc as a choice to revisit, not a bug.
2. **A1, "High":** "`claude-sonnet-5` is not a documented model; it will 400." Wrong: it is a current Anthropic model id. The agent's model list predates it.
3. **A2:** "the control-plane session carries to `/hq` via the same cookies; the manifest note is inaccurate." Wrong. The control plane and the tenant app are configured as separate Supabase projects (`CONTROL_PLANE_*` vs `TENANT_*` env, `lib/supabase/config.ts`), and Supabase auth cookies are named per project. A control-plane login is not a church-app session. The nav's "(church-app sign-in)" is accurate.
4. **A4, "High":** "HQ RLS allows admin/manager/teacher; the portable doc's platform-admin-only SQL is wrong." Wrong. Migration `20260930010000` drops every `hq_*` policy and replaces each with `is_platform_admin()`. A4 read only the original 20260713 policies.
5. **A4:** "the in-app Council's limits aren't shown in the UI." Wrong. The Council mode description says it reviews text, not code, and that it recommends while you decide. The synthesis card says "A recommendation, not a decision. Check each claim before acting on it."
6. **A3, "Critical":** "hard-coded card gradients violate ADR 0026." These predate this branch and sit within the ratchet allowance (`components/theme-provider.test.ts`). This branch adds no colour literals. The severity is overstated and the finding is out of scope.
7. **A5:** a "time-of-check/time-of-use" gap between the role check and the register load, plus "6 sequential calls." Neither holds. RLS re-checks `is_platform_admin()` on every register read, and the seat calls run in parallel (`Promise.all`).

## Accepted risk, recorded

**Register text reaches the model as-is**, apart from emails and IDs (A5, prompt injection). The model has no tools, the output is rendered as text (no HTML), and the status is advisory. The portable doc's Limits section states this.

## Documenter

The Documenter records:
- the Council v2 adoption in `DEVELOPMENT_PLAN.md` history (A4) and in `CHANGELOG.md`;
- the README pointer;
- the memory update (the Council mandate is now 5 + 1).

No §0 row: this is process infrastructure, with no effect on the Nov 6 schedule.
