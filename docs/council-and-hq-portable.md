# The Council and Project HQ: a portable specification

This document describes ChurchCore's review process (the **Council**, version 2, adopted 2026-10-02) and its internal project dashboard (**Project HQ**), in enough detail to rebuild both in another codebase. ChurchCore-specific names appear only as examples; replace them with your own.

In ChurchCore, the sources of truth are `improve-software.md` (the protocol), `.claude/agents/documenter.md` (the Documenter), `lib/council/seats.ts` and `lib/council/run.ts` (the in-app Council), `app/api/ai/route.ts` and `app/hq/` (HQ). If this document and those files disagree, the files win, and this document should be updated.

There are two Councils, and they are not interchangeable:

| | The code Council (§1–§6) | The in-app Council (§8) |
|---|---|---|
| Who runs it | AI coding agents that read the repository | An LLM called from the HQ web page |
| What it sees | The code, the diff, the tests, the docs | Only the proposal text and HQ's register |
| What it can verify | Claims against source, by reading files and running checks | Nothing beyond the text it is given |
| Gates a merge | Yes | No |

---

## 1. The mandate

- **The Council runs before every non-trivial merge to the main branch.** Non-trivial means a new feature, a schema change, a security-relevant change, or a branch with several accumulated commits.
- **Small, isolated fixes may skip it.** Examples: a typo, a one-line config change, a dependency bump with no behaviour change.
- **The exemption depends on the change, not the schedule.** A small change qualifies; a reviewer in a hurry does not.
- **The pull request records the review.** Its description links the Council's synthesis and confirms the Documenter signed off.

**Why the Documenter exists.** The earlier rounds had audit and synthesis but no Documenter. Over those rounds the plan and docs drifted away from what had actually shipped.

## 2. The cycle

```
Trigger → 5 audit agents in parallel → Synthesis (status + verified findings)
        → ADRs + implementation prompts → Build (with tests) → Verification
        → Documenter closes the loop → Pull request → External review → Merge
```

1. **Audit.** Five read-only agents run in parallel, each with its own brief (§3).
   - Each must be a *separate* agent or model call.
   - One model writing five opinions in one response is not a Council: the seats can't disagree independently.
2. **Synthesize.** Group the findings, verify every claim against the source, and assign a status (§4).
3. **Record decisions.** Write an Architecture Decision Record (ADR) for every new boundary, access pattern, integration contract or data-exposure rule.
4. **Build.** Turn each agreed change into a self-contained implementation prompt and execute it with tests.
5. **Verify.** Run the definition of done (§5).
   - A red result is a stop condition.
   - It goes back to the builder, never forward to the Documenter.
6. **Document.** The Documenter, Agent 6, closes the loop (§6).
7. **Pull request and external review.**
   - Read every comment from the code host's automated reviewer (Copilot, in ChurchCore) and resolve it before merging.
   - In ChurchCore that reviewer repeatedly caught real bugs after a clean Council, including on each of the four PRs before Council v2; it is a second net, not a formality.

## 3. The five audit seats

All five are **read-only**. Each report gives findings with a file and line, the concrete failure, and a fix. Anything the agent could not verify is marked `UNVERIFIED`. Replace `[REPO_ROOT]` with your repository path, and the bracketed examples with your own files.

**Why Security has its own seat.** In v1, security was folded into the data/API seat. Across 20+ rounds, security findings kept recurring there, so v2 splits it out. The recurring findings were:
- privileged database functions trusting a caller-supplied actor;
- webhooks failing open;
- server actions with no gate;
- weak proofs on public actions.

### Agent 1 — Data & API

```
You are Council Agent 1. Your job is a data and API audit: schema hygiene, migrations, data integrity and concurrency. (Security is Agent 5's seat.) READ-ONLY — do not edit any files.

Repo root: [REPO_ROOT]

1. Schema — list every table created by the migrations, whether it has row-level security enabled, and any table no application code references.
2. Server libraries — for each major module, are there matching data-access code and tests? Flag gaps.
3. API routes — list every route file and its HTTP methods.
4. Pages — list every page; flag stubs and pages that only redirect.
5. Seed data — is the demo dataset realistic? What is missing?
6. Migrations — is each new migration backwards-compatible with the code running before it deploys (no dropped or renamed column still read, no new NOT NULL without a default)? Does it state how it would be rolled back? Are writes that must happen together (a ledger post, a claim and its marker) in one transaction or otherwise race-safe? Is anything a retry might repeat idempotent?
7. Top 5 critical missing pieces for data integrity — be specific and honest.

Return concise structured markdown, 500–700 words.
```

### Agent 2 — Routes & Pages

```
You are Council Agent 2. Your job is a route and page audit. READ-ONLY — do not edit any files.

Repo root: [REPO_ROOT]

1. Navigation inventory — read every navigation component [e.g. the app shell, mobile bottom nav, reports shell] and list every href.
2. Page existence — for every href, does a page exist? Mark each EXISTS / STUB / MISSING (404).
3. API completeness — for every client form or button that calls the server, does the handler exist? Report orphaned handlers.
4. Link consistency — hardcoded links to routes that don't exist.
5. Journeys — for each changed flow, walk it end to end, including failure, cancel and retry: what does the user see, and what does the data hold afterwards? Which roles can reach each page?
6. Summary table — | Route | Nav | Status | Notes |

Return concise structured markdown, 400–600 words. Name every 404 and stub.
```

### Agent 3 — UX & Shell

```
You are Council Agent 3. Your job is a UX, accessibility and shell audit. READ-ONLY — do not edit any files.

Repo root: [REPO_ROOT]

1. ARIA — aria-expanded, aria-selected, aria-label, aria-current: strings where booleans belong, or missing where required.
2. Loading and empty states — for each major page, is empty data handled, is there a loading state, can it crash on an empty list?
3. Styling — are referenced classes defined; do colours come from the design system's tokens; does it work at phone width; does text meet WCAG AA contrast (compute it, don't eyeball it)?
4. Navigation active state — consistent across layouts?
5. Error handling — error boundaries; do server components handle database errors or crash?
6. Copy — is every message accurate at the moment it's shown, translatable, and confirmed before destructive actions?
7. Top 3 pain points a real user would hit today.

Return concise structured markdown, 400–600 words.
```

### Agent 4 — Feature & Competitive

```
You are Council Agent 4. Your job is feature completeness, the plan, and competitive gaps. READ-ONLY — do not edit any files.

Repo root: [REPO_ROOT]
Read first: [the development plan], [the role/access matrix], [the data segmentation doc].

1. Workflow completion — percentage complete for each core module.
2. Role coverage — 0–100% access validation for each role.
3. Definition of done — does the work meet its stated acceptance criteria, item by item?
4. Plan fit — dependencies, what this unblocks, the effect on the deadline.
5. Competitive gap — vs. [named competitors]: the 5 most critical gaps preventing adoption. Cite evidence for every competitor claim; without it, say UNVERIFIED.
6. Readiness score — 0–100 with justification. Be honest.

Return concise structured markdown, 500–700 words.
```

### Agent 5 — Security

```
You are Council Agent 5. Your job is a security audit. READ-ONLY — do not edit any files.

Repo root: [REPO_ROOT]

Threat-model the scope under review. For every finding give the file:line, the concrete attack or failure, and a fix; mark anything you could not verify as UNVERIFIED.

1. Authorization — does every server-callable function and API route authenticate its own caller and check the role? Does any take a tenant, user or actor id from the caller instead of the session?
2. Tenant isolation — does every read and write through a privileged (service-role) client scope by tenant? Can one tenant read or change another's rows?
3. Row-level security — for every new or changed table: enabled, anonymous access revoked, no client write path the server doesn't intend, no column a direct query could use to defeat masking the server does.
4. Privileged database functions — does any take its actor from an argument instead of the authenticated session? Who can execute it?
5. Unauthenticated surfaces — webhooks (signature verified against the provider's real scheme, fail closed with no secret, replay window), public actions (rate limits, what proof stands in for a session), demo and stub routes (gated off in production).
6. Secrets and PII — keys never reach the client, PII scrubbed before third parties (including LLMs), audit-log entries for privileged changes.
7. Top 5 security risks in scope, ranked.

Return concise structured markdown, 500–800 words.
```

## 4. The synthesis

After all five reports arrive, the orchestrator writes `docs/reviews/YYYY-MM-DD-council-review-N-synthesis.md`. The five reports go in `...-agents-1-5.md`.

**§0 Status and claim verification.**

- **Status**, on its own first line:
  - `RATIFIED`: ready as built.
  - `AMENDED`: ready once the listed fixes land.
  - `REJECTED`: back to design.
- The status is a **recommendation**. The owner decides.
- **Verify every agent claim against the source before adopting it.** Use computation where that settles it: contrast ratios, wire formats, date arithmetic.
- **List the claims that proved wrong or unsupported.** In ChurchCore, agents made wrong claims in every one of 25+ consecutive rounds. Recurring shapes:
  - an inference stated as fact;
  - a narrative contradicting the agent's own detailed findings;
  - "lint passes" from an agent with no shell access;
  - a competitor or legal claim without evidence;
  - our own code comment or ADR describing something that was never built.
- A finding that isn't verified isn't a finding.

**§1 Consensus.** Findings that more than one seat raised independently. Highest priority.

**§2 ADR drafts.** Write one for each new boundary, access pattern, integration contract or data-exposure rule. Number them sequentially.

**§3 Implementation prompts.** One per agreed change:

```
## Prompt [LETTER] — [SHORT TITLE]
**ADR Reference:** ADR-XXXX (if applicable)
**Files:** [files to create or modify]
**Scope:** [1–3 sentences]
**Work:**
1. [step]
**Verification:**
- [test command] / [lint command] / [build command]
- [any additional check]
```

**§4 Execution order.** Dependency order. Mark which prompts can run in parallel.

**Optional: the owner's register.** Record each decision the owner made in the round, with options and a recommendation, so the plan never depends on chat history.

## 5. The definition of done

Before work goes to the Documenter, all of the following must pass. Adapt the commands to your stack.

1. **Unit tests**, plus a **surface-coverage check**. Every page, API route and server action is registered in a manifest that names its allowed roles and its tests. The allowed roles come from the code's real gates, never guessed. An unregistered or untested surface fails the build.
2. **Browser and API end-to-end tests** against a local database, whenever pages, routes or actions changed: every page × every role, and every API route.
3. **Lint**: zero violations.
4. **Production build** succeeds.
5. **Migrations.** For any change that includes one:
   - the migration linter passes;
   - the migration applies to a freshly reset database;
   - it is backwards-compatible with the code running before it deploys;
   - its rollback is stated, in the migration's comments or the PR.
6. **CI.** Required checks are green. The commit signatures verify, if the branch requires them.

## 6. Agent 6 — the Documenter

The Documenter is a write role, scoped to docs, the changelog, the plan, ADRs and memory. It never touches application code. It runs after verification is clean and before the PR opens.

1. **The plan.**
   - Mark shipped rows done, with the PR.
   - Add a row for every new open item, or defer it with a reason. No open item may live only in a review document or in chat.
   - Update the progress line and, on milestone dates, the cut-line check.
2. **The changelog.** An `[Unreleased]` entry in the repository's existing style.
3. **The README and affected docs.**
4. **ADRs.** Every ADR the synthesis references exists and is correctly numbered.
5. **Review output.** Confirm the synthesis and agent reports are committed, not just produced.
6. **Memory.** Record decisions, mandates and recurring gotchas a future session needs. Skip anything derivable from code or history.
7. **A handoff note**, in the PR or a committed file, covering: intent, architecture impact, verification commands and results, residual risk, and follow-up work.
8. **Test surfaces.** Withhold sign-off if a surface shipped without a manifest entry and tests, or if CI's end-to-end job isn't green.

**Stop condition.** Never invent status. If something can't be verified (no passing test, no green build, no evidence in the diff), say so instead of marking it done.

## 7. Project HQ

HQ is an internal page for the people who build the product: a register of tasks, risks and decisions, plus an AI advisor and the in-app Council. In ChurchCore it lives at `/hq`.

### Access

HQ is **platform staff only**, and this is enforced in three places:

1. A server-side layout gate redirects anyone who isn't a platform admin.
2. Every HQ table's row-level security allows only platform admins.
3. The AI endpoint re-checks the role itself, before any model call. Without that check, any signed-in user could spend the AI budget.

**Discoverability.** HQ is reached by a visible "Project HQ" link in the platform admin's navigation, not hidden triggers. An access-controlled page doesn't need to be secret, and hidden triggers are invisible to the people who should find it.

### Data model (Postgres)

```sql
create table hq_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'backlog'
    check (status in ('backlog','ready','in_progress','review','blocked','done')),
  owner text,
  priority text not null default 'P2' check (priority in ('P0','P1','P2','P3')),
  source text not null default 'manual' check (source in ('manual','risk','council')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table hq_risks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  mitigation text,
  severity int not null default 3 check (severity between 1 and 5),
  probability int not null default 3 check (probability between 1 and 5),
  owner text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table hq_decisions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  owner text,
  status text not null default 'Proposed'
    check (status in ('Proposed','Accepted','Rejected','Superseded')),
  impact text not null default 'Medium' check (impact in ('Critical','High','Medium','Low')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- Every AI interaction, as institutional memory.
create table hq_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  agent_id text not null,      -- 'hq-governance' (advisor) or 'hq-council'
  agent_name text not null,
  prompt text not null,        -- stored PII-scrubbed
  response text not null,
  created_at timestamptz not null default now()
);

-- Row-level security on all four; platform admins only, and sessions only your own.
alter table hq_tasks enable row level security;   -- likewise the other three
create policy "hq_tasks: platform admins" on hq_tasks for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy "hq_sessions: platform admins, own sessions" on hq_sessions for all to authenticated
  using (is_platform_admin() and user_id = auth.uid())
  with check (is_platform_admin() and user_id = auth.uid());
```

### The AI endpoint (`POST /api/ai`)

Request:

```json
{ "prompt": "string, at most 8000 characters", "mode": "advisor" | "council" }
```

The order of operations:

1. **Authenticate**: 401 if signed out.
2. **Authorize**: 403 unless the caller is a platform admin. This happens before any model call.
3. **Check configuration**: 500 "AI features are not configured" without an API key.
4. **Validate the prompt**: 400 for an empty or oversized prompt.
5. **Scrub PII from the prompt.** Emails and UUIDs are replaced with `[EMAIL]` and `[ID]`. The regular expressions use bounded quantifiers, because they run on user input and unbounded ones allow catastrophic backtracking.
6. **Load HQ's register.** This means open tasks, risks and recent decisions, at most 25 rows each.
   - It is read as the caller, so row-level security still applies.
   - It is rendered as plain text and scrubbed too.
   - A table that fails to load is said to have failed, not silently omitted.
7. **Call the model.**
   - **advisor**: one call, with the advisor system prompt (§8). The user message is the question followed by the register.
   - **council**: the in-app Council (§8).
8. **Log the exchange to `hq_sessions`.** A failed log is reported in the server log; it doesn't fail the request.
9. **Respond.**
   - advisor: `{ mode, response }`.
   - council: `{ mode, status, synthesis, seats: [{ id, name, review, recommendation }] }`.
   - A model error returns 502 with a generic message. The provider's error text can carry request details, so it is logged, never returned.

**The model** is configurable: `AI_HQ_MODEL`, defaulting to a current model. In ChurchCore the default is `claude-sonnet-5`. Never default to a dated model id without checking that it hasn't been retired. ChurchCore's original default had been retired, and nobody noticed because the endpoint had no test that exercised the model id.

### The page

- **Tabs**: Tasks, Risks, Decisions, AI.
- **The AI tab**:
  - a mode switch (Advisor / Council review);
  - starting-point templates;
  - a prompt box;
  - the result;
  - a history list from `hq_sessions`.
- **Council results show**:
  - the synthesis, with its status badge;
  - one card per seat, with that seat's own recommendation;
  - the reminder that this is a recommendation, and that claims should be checked before acting on them.
- **Templates.** Those with placeholders (`<…>`) fill the prompt box for editing instead of sending.

## 8. The in-app Council

**The runner** (`runCouncil`):

1. Calls the model once per seat, **in parallel**. Each call gets that seat's brief plus the shared rules as its system prompt, and the same user message: the proposal plus the register.
2. Then makes one synthesis call. It receives the proposal, the register, and all five reviews.
3. Parses statuses only from their marked lines: `Seat recommendation: X`, and `Status: X` at the start of a line.
   - When the model gives no status, the status is `null`.
   - It is never guessed from words elsewhere in the text.

That makes six calls per run. In ChurchCore the limits are a 900-token cap per seat and a 1,200-token cap for the synthesis.

### Shared rules (appended to every seat's brief)

```
Rules for every seat:
- Judge only what the proposal and the register actually say. If something you'd need isn't there, say "UNVERIFIED: <what's missing>" instead of assuming it.
- No invented facts: no competitor features, statistics or library behaviour you can't point to in the text.
- Give each finding a severity (Critical, High, Medium, Low), the concrete failure it would cause, and a fix.
- End with one line: "Seat recommendation: RATIFIED", "Seat recommendation: AMENDED" (acceptable once your listed fixes are made) or "Seat recommendation: REJECTED".
- Keep it under 350 words. No IDs or emails.
```

### Seat briefs

Replace the product description in each with your own.

1. **Data & API.** "Review the proposal for:
   - the data model and its constraints;
   - whether migrations are backwards-compatible with the code running before they deploy, and say how they'd be rolled back;
   - writes that must happen together (in one transaction, or race-safe);
   - idempotency of anything a retry might repeat;
   - API contracts."
2. **Routes & Pages.** "Review the proposal for:
   - which pages, routes and actions it adds or changes;
   - which roles can reach each;
   - every journey end to end (what the user sees and what the data holds afterwards), including failure, cancel and retry paths;
   - dead ends or misleading messages."
3. **UX & Accessibility.** "Review the proposal for:
   - whether each step is clear to a non-technical user;
   - whether every message is accurate at the moment it's shown;
   - confirmation before destructive actions;
   - keyboard and screen-reader use;
   - phone widths;
   - whether new text can be translated."

   Also name your design system's rules: ChurchCore's is dark-first, colours come only from the theme, and it targets WCAG AA.
4. **Feature & Plan.** "Review the proposal for:
   - the value to a real user and who it serves;
   - whether it meets its stated definition of done, item by item;
   - scope creep or gaps;
   - dependencies;
   - fit with the plan and deadline in the register.

   Make no claims about competitors unless the proposal or register supplies the evidence."
5. **Security.** "Threat-model the proposal:
   - does every server action and route authenticate its own caller and check the role, taking tenant and user ids from the session rather than the caller;
   - can one tenant read or change another's data;
   - are new tables protected by row-level security, with no column that defeats server-side masking;
   - does any privileged database function trust a caller-supplied actor;
   - are webhooks and public actions verified, rate-limited and fail-closed;
   - do secrets stay server-side, and is personal data kept from third parties;
   - are privileged changes audited."

### The synthesis prompt

```
You are the Council's synthesis. You receive a proposal and the five seats' reviews (Data & API, Routes & Pages, UX & Accessibility, Feature & Plan, Security). Write the Council's recommendation for the owner, who decides:

Status: RATIFIED | AMENDED | REJECTED   (first line, exactly one of these)

1. Verdict — two or three sentences.
2. Consensus — findings more than one seat raised.
3. Required before ratifying — the fixes, by severity (only if AMENDED).
4. Disagreements and weak claims — where seats disagree, or a seat asserted something the proposal doesn't support; don't adopt those.
5. Open questions for the owner.

RATIFIED: no Critical or High findings stand. AMENDED: fixable findings stand. REJECTED: a Critical design problem, or the proposal is too unclear to judge. Under 450 words. No IDs or emails.
```

### The advisor prompt

```
You are the [Product] Project HQ Governance Advisor. [One line on the product.] Help platform staff analyse the project's governance: its tasks, risks and decisions (given as HQ's register below the question), and the plan. Give professional, structured, direct guidance. Base claims on the register and the question; say what you'd need to know when they don't settle it. Never show raw IDs or emails.
```

### Limits — state these wherever the in-app Council is shown

- **It reviews text, not code.** It can't read the repository, run tests, or verify a claim against source. A RATIFIED proposal can still be built wrong.
- **It doesn't satisfy the merge mandate.** Only the code Council (§1–§6) does.
- **Its status is a recommendation.** The owner decides.
- **Each run costs six model calls.** Keep it behind the platform-admin gate.

## 9. What we deliberately did not adopt

These were proposed, and rejected for stated reasons. Revisit them if your situation differs.

- **Large persona rosters** (a dozen named experts). Five seats with distinct briefs already cover the review surface. Each extra persona costs calls and adds overlap without adding independence.
- **Unanimous-vote templates** ("6/6 RATIFIED"). A vote count suggests a rigour the process doesn't have when one model produces every vote. Use a status plus verified findings instead.
- **Hidden "easter-egg" triggers to reach the internal dashboard.** Access control belongs in the server and the database; discoverability belongs in the navigation.

## 10. Adoption checklist for another codebase

1. Copy §3's five prompts into your agent tooling, adjusted to your file layout, with a sixth Documenter agent (§6).
2. Add the mandate (§1) and the definition of done (§5) to your contributor rules.
3. Create `docs/reviews/` and `docs/adr/`. Commit a synthesis per round, in the §4 format.
4. Optional: build HQ (§7). Create the four tables with row-level security, then:
   - a server-side gate;
   - the endpoint, which re-checks the role, scrubs PII, loads the register and logs each exchange;
   - the page.
5. Optional: add the in-app Council (§8):
   - the seat briefs as data;
   - a runner that makes separate calls in parallel;
   - status parsing from marked lines only;
   - the limits shown in the UI.
6. Test it:
   - the gate (401/403 before any model call);
   - one call per seat, each with its own brief;
   - a missing status reads as `null`;
   - the model id comes from config;
   - provider errors aren't echoed back.
