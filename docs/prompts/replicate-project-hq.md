# Prompt: build "Project HQ" in any codebase

This is a self-contained prompt for an AI coding agent such as Claude Code, Codex or Cursor. It builds **Project HQ** in an existing application: an internal, staff-only page holding a register of tasks, risks and decisions, plus an AI governance advisor and an in-app AI Council. All AI calls go through an OpenRouter gateway with per-feature model fallbacks, zero data retention, and cost logging.

It is distilled from ChurchCore's `/hq` (`app/hq/`, `app/api/ai/route.ts`, `lib/council/`, `lib/ai/`, ADR 0027, `docs/council-and-hq-portable.md`), including the bugs we hit and fixed. Paste everything below the line into the agent, then fill in the `[BRACKETS]`.

---

## Your task

Build **Project HQ** into this application.

It is an internal page for the people who build and run the product (platform staff), not for customers. It has:
- a governance register: tasks, risks and decisions (ADRs);
- an **AI Governance Advisor**, which answers questions about the register;
- an **in-app AI Council**: five independent AI reviewers and one synthesis that review a written proposal and recommend RATIFIED, AMENDED or REJECTED.

Every AI call goes through one server-side **gateway** to OpenRouter.

**Product context to use in prompts and copy:**
- Product name: `[PRODUCT NAME]`
- One-line description: `[WHAT THE PRODUCT DOES AND FOR WHOM]`
- Who counts as "platform staff": `[ROLE / TABLE / CLAIM THAT IDENTIFIES THEM]`
- Design system rules: `[e.g. dark-first, colours only from theme tokens, WCAG AA]`
- Deadline or plan to judge against (optional): `[e.g. MVP on <date>, tracked in <file>]`

### Ground rules for you, the agent

1. **Discover before you build.** Read the repo's contributor rules, auth and session code, database client helpers, migration conventions, test setup, design system and navigation before writing anything. Use the repo's existing patterns, framework version and libraries. Don't introduce a second auth system, ORM, UI kit or test runner. If the framework version differs from what you know, read its bundled docs first.
2. **Never guess an external API's wire format.** Before writing the gateway, read OpenRouter's current docs: chat completions, provider routing, model fallbacks, usage accounting, and the models list at `GET https://openrouter.ai/api/v1/models`. Check model ids against that list, and test the exact request body against the documented contract. The contract summarised below was verified on 2026-10-04; re-verify it.
3. **Security is deterministic.** Authorization, row-level security, tenant isolation, PII scrubbing, consent, audit logging and rate limits are code and database rules, never model judgment.
4. **Every surface ships with tests.** That means the page, the API route, every server action, the gateway, the Council runner and the PII scrubber.
5. **Report honestly.** At the end, list what you verified (commands and results), what you couldn't verify (for example, no live OpenRouter call), and any deviation from this spec, with reasons.

---

## 1. Access: platform staff only, enforced in three places

1. **A server-side gate** in the page's layout or middleware.
   - Signed out → redirect to sign-in.
   - Signed in but not platform staff → redirect to the user's home.
   - Never rely on hiding the link.
2. **Database row-level security** on every HQ table allows only platform staff (see §2). With RLS, the HQ register is read **as the caller**, not with a service-role key.
3. **The AI endpoint re-checks the role itself, before any model call.** Without this, any signed-in user could spend the AI budget.

**One source of truth for "platform staff".** If the app has more than one auth project or database (for example, a separate admin or control plane), decide which one HQ checks, and make the same person resolve to platform staff wherever they sign in. Document it. *Lesson: ChurchCore's HQ checked a staff table in a different database from the one its admin console used. The owner was staff in one and absent from the other, and couldn't get in.*

**Discoverability.** Add a visible "Project HQ" link in navigation, shown only to platform staff. Don't use hidden triggers such as key combos, logo clicks or secret search commands: access control belongs in the server and database, and discoverability belongs in the navigation.

## 2. Data model (Postgres; adapt the syntax to the repo's migration tool)

All migrations must be additive and idempotent (`if not exists`), and state their rollback in a comment.

```sql
create table if not exists hq_tasks (
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

create table if not exists hq_risks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  mitigation text,
  severity int not null default 3 check (severity between 1 and 5),
  probability int not null default 3 check (probability between 1 and 5),
  owner text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists hq_decisions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  owner text,
  status text not null default 'Proposed'
    check (status in ('Proposed','Accepted','Rejected','Superseded')),
  impact text not null default 'Medium' check (impact in ('Critical','High','Medium','Low')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- Every AI exchange, as institutional memory, with its cost.
create table if not exists hq_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  agent_id text not null,            -- 'hq-governance' (advisor) or 'hq-council'
  agent_name text not null,          -- 'HQ Governance Advisor' or 'HQ Council'
  prompt text not null,              -- stored PII-scrubbed
  response text not null,
  model_used text,                   -- the model(s) that actually answered, ", "-joined for the Council
  provider text,                     -- 'openrouter' or the backup provider
  prompt_tokens int,
  completion_tokens int,
  cost_usd numeric(12,6),            -- summed across all calls for a Council run; null if unknown
  created_at timestamptz not null default now()
);

alter table hq_tasks enable row level security;
alter table hq_risks enable row level security;
alter table hq_decisions enable row level security;
alter table hq_sessions enable row level security;

-- is_platform_admin(): SECURITY DEFINER, `set search_path = public`, takes NO arguments,
-- reads auth.uid() itself (never a caller-supplied user id). Grant EXECUTE to authenticated only.
create policy "hq_tasks: platform staff" on hq_tasks for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
-- …the same for hq_risks and hq_decisions…
create policy "hq_sessions: platform staff, own sessions" on hq_sessions for all to authenticated
  using (is_platform_admin() and user_id = auth.uid())
  with check (is_platform_admin() and user_id = auth.uid());

revoke all on hq_tasks, hq_risks, hq_decisions, hq_sessions from anon;

-- Rollback: drop table if exists hq_sessions, hq_decisions, hq_risks, hq_tasks;
--           (and drop the policies / function if this migration created them)
```

If the app is multi-tenant, HQ is **platform-level**, not per tenant: don't add a tenant id. Seed a handful of example rows only in development and demo seeds, never in production migrations.

## 3. The AI gateway: one module, every model call goes through it

Create a server-only module, for example `lib/ai/gateway.ts`, plus a model registry, for example `lib/ai/models.ts`. No other file may call a model provider directly.

### 3.1 OpenRouter request contract (re-verify against the docs)

- **Request:** `POST https://openrouter.ai/api/v1/chat/completions` with headers `Authorization: Bearer ${OPENROUTER_API_KEY}` and `Content-Type: application/json`.
- **Body fields we use:**
  - `model`: the first model in the feature's list;
  - `models`: the full ranked list, so OpenRouter falls back on any error and tries the next model. The response's `model` field names the model that answered, and billing follows it.
  - `messages`: `[{role:"system",content}, …user/assistant]`, with the system message first;
  - `max_tokens`.
- **`provider: { zdr: true, data_collection: "deny", allow_fallbacks: true }`.**
  - `zdr: true` restricts routing to zero-data-retention endpoints. `data_collection` defaults to `"allow"`, so set it explicitly.
  - **Fail closed:** if no zero-retention endpoint can serve the request, it errors. Never retry without the policy.
- **The response:**
  - text at `choices[0].message.content`;
  - usage is always included in `usage.prompt_tokens`, `usage.completion_tokens` and `usage.cost` (the old `usage: { include: true }` request flag is deprecated);
  - errors come back as `{ "error": { "code", "message", "metadata" } }`.
  - Treat an `error` object on a 200 response as a failure too.
- **Statuses to handle:**
  - 400 bad request;
  - 401 bad key;
  - **402 out of credits**;
  - 403 guardrail;
  - 404 (for example, no zero-retention endpoint);
  - **429 rate limited**;
  - 500 and 503 provider errors.

### 3.2 Gateway interface

```ts
type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatCompletion = {
  text: string;
  model: string;                       // the model that actually answered
  provider: "openrouter" | "anthropic"; // or your backup provider
  usage: { promptTokens: number; completionTokens: number; costUsd: number | null };
};
type CompleteChat = (req: {
  feature: AiFeature;                  // e.g. "hq-advisor" | "hq-council-seat" | "hq-council-synthesis"
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  timeoutMs?: number;                  // default 60_000
  signal?: AbortSignal;
}) => Promise<ChatCompletion>;
```

### 3.3 Behaviour

- **PII scrubbing inside the gateway.** Scrub every message's content on every path before sending. Don't scrub the system prompt, which is yours. Callers must not be able to skip it. *Lesson: one feature sent pastoral notes unscrubbed because only one caller scrubbed.* See §5 for the scrubber.
- **Timeout:** `AbortSignal.timeout(timeoutMs)`, combined with the caller's signal through `AbortSignal.any`.
- **Typed errors:**
  - `AiNotConfiguredError` when no provider key is set;
  - `AiProviderError(status)` with a *safe* message for everything else.
  - Log the provider's error body on the server; **never** return it to the client, because it can echo request details.
- **An empty response is an error.**
- **Provider choice and backup:** OpenRouter when `OPENROUTER_API_KEY` is set. Otherwise, optionally, call one direct provider (for example Anthropic) as the backup, with that feature's direct model id. The backup has no cross-vendor fallback, and its `costUsd` is `null` (most direct APIs return tokens, not price). If neither key is set, throw `AiNotConfiguredError`.
- **`isAiConfigured()`** for routes that need to return "not configured" without calling.

### 3.4 Model registry (per feature, overridable by env, never a hard-coded retired id)

| Feature | OpenRouter models, in order | Direct backup | Output cap | Timeout |
|---|---|---|---|---|
| `hq-advisor` | `anthropic/claude-sonnet-5.5`, `google/gemini-2.5-pro` | `claude-sonnet-5-5` | **3,000 tokens** | 55 s |
| `hq-council-seat` | `anthropic/claude-sonnet-5.5`, `google/gemini-2.5-pro` | `claude-sonnet-5-5` | 900 | 25 s |
| `hq-council-synthesis` | `anthropic/claude-opus-5.5`, `anthropic/claude-sonnet-5.5` | `claude-opus-5-5` | 1,200 | 25 s |

- **Before use:** confirm every id against OpenRouter's live models list and the backup provider's model list, and replace any that no longer exist.
- **Env overrides:**
  - `AI_MODELS_<FEATURE>`, a comma list, e.g. `AI_MODELS_HQ_ADVISOR`;
  - `AI_ANTHROPIC_MODEL_<FEATURE>`.
- **Lessons:**
  - Our original default model id had been retired, and nobody noticed because no test exercised the id. Test that the id comes from config.
  - The first live advisor answer stopped at *exactly* the old 1,524-token cap. If `completion_tokens` equals your cap, the answer was truncated: raise the cap within your time budget.
- **Time budget:** cap × typical output speed must fit the route's serverless time limit, with headroom. A Council run is 5 parallel seats *then* the synthesis, so its worst case is roughly seat timeout + synthesis timeout. Set the route's `maxDuration` (or your platform's equivalent) explicitly.
- **Known risk:** Gemini 2.5 Pro counts hidden reasoning tokens against `max_tokens`. Under a small cap it can return empty content, which the gateway correctly treats as an error. Keep the fallback order with that in mind.

## 4. The AI endpoint: `POST /api/ai`

**Request:** `{ "prompt": string (≤ 8000 chars), "mode": "advisor" | "council" }`. `mode` may be absent, which means advisor.

**Order of operations; keep it exactly:**

1. **Authenticate:** 401 if signed out.
2. **Authorize:** 403 unless the caller is platform staff, checked through the same function as the RLS. This happens **before** any model call.
3. **Configuration:** 500 `{ "error": "AI features are not configured in this environment." }` when `isAiConfigured()` is false.
4. **Validate:** 400 when:
   - the body isn't JSON or isn't a JSON **object** (`null` and arrays are rejected);
   - `mode` is anything other than `advisor`, `council` or absent;
   - the prompt is empty or whitespace;
   - the prompt is over 8,000 characters.
5. **Throttle per person:** 429 beyond **10 advisor questions** or **3 Council runs** per minute. A Council run is six model calls, and even staff shouldn't loop it.
6. **Scrub the prompt** (§5). The scrubbed text is what's sent and what's logged.
7. **Load the register as the caller** (RLS applies):
   - Read open tasks, risks and recent decisions, at most 25 rows each.
   - **Only titles and structured fields:** status, priority, severity, probability, impact. **Never send owners or mitigation notes.** They are free text about people (data minimisation).
   - Render the register as plain text, scrub it too, and say "(couldn't be loaded)" for a table that failed rather than silently dropping it.
8. **Call the model through the gateway:**
   - **advisor:** one call. System prompt: §6.1. User message: `"${question}\n\nHQ REGISTER (context):\n${register}"`.
   - **council:** the Council runner (§6.2).
9. **Log to `hq_sessions`:**
   - `agent_id` and `agent_name` come from the **mode**, never from the request body (a caller could otherwise spoof the log);
   - store the scrubbed prompt, the response, the model(s), the provider, tokens and cost (summed for the Council);
   - a failed log is reported in the server log and doesn't fail the request.
10. **Respond:**
    - advisor: `{ mode, response }`;
    - council: `{ mode, status, synthesis, seats: [{ id, name, review, recommendation }] }`.
11. **Errors:**
    - `AiProviderError` 402 → 502 `"AI credits are exhausted. A platform admin needs to top up the AI account."`;
    - 429 → 503 `"The AI provider is busy. Try again in a minute."` (503 so it isn't confused with your own 429 throttle);
    - anything else → 502 `"The AI request failed. Try again."`;
    - never the provider's text.

## 5. PII scrubber (`lib/ai/scrub.ts`, used by the gateway and the route)

- Replace emails → `[EMAIL]`, UUIDs → `[ID]`, phone numbers → `[PHONE]`.
- **Bounded quantifiers only** (for example `[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,255}\.[a-zA-Z]{2,24}`). The scrubber runs on user input, and unbounded patterns allow catastrophic backtracking (ReDoS). Test it with a 50,000-character adversarial string completing in under a second.
- **Shaped phone patterns** (North American with optional `+1`/`1`, parentheses, separators; or `+`-prefixed international), so dates (`2026-10-03`), version and PR numbers, and plain numbers survive.
- Names are **not** scrubbed. Say so in the UI and ask people to leave names out.

## 6. The prompts (adapt the bracketed product details; keep the structure)

### 6.1 Advisor system prompt

```
You are the [PRODUCT NAME] Project HQ Governance Advisor. [ONE LINE ON THE PRODUCT.] Help platform staff analyse the project's governance: its tasks, risks and decisions (given as HQ's register below the question), and the plan. Give professional, structured, direct guidance. Base claims on the register and the question; say what you'd need to know when they don't settle it. Never show raw IDs or emails.
```

### 6.2 The in-app Council

**The runner** (`runCouncil({ complete, proposal, register })`, with the gateway injected so it's testable):

1. **Five seat calls, in parallel.** Each gets its own system prompt (its brief plus the shared rules) and the same user message: `"PROPOSAL UNDER REVIEW:\n${proposal}\n\nHQ REGISTER (context):\n${register}"`. They are separate calls: one response must never "vote" as several seats.
2. **Then one synthesis call**, with the proposal, the register and all five reviews (`=== Seat name ===\n<review>` each).
3. **Status parsing, strictly from required lines only:**
   - a seat's **last** non-blank line must be `Seat recommendation: RATIFIED|AMENDED|REJECTED`;
   - the synthesis's **first** non-blank line must be `Status: RATIFIED|AMENDED|REJECTED`;
   - tolerate markdown emphasis around the line (`**Status: AMENDED**`), case-insensitive;
   - anything else, including a status *quoted* elsewhere from the proposal, the register or another seat, is ignored, and the status is `null`;
   - never infer a status from prose.
4. **Return** `{ status, synthesis, seats: [{ id, name, review, recommendation }], usage: { promptTokens, completionTokens, costUsd (null only if no call reported one), models: string[], providers: string[] } }`.

**Shared rules** (appended to every seat's brief):

```
Rules for every seat:
- Judge only what the proposal and the register actually say. If something you'd need isn't there, say "UNVERIFIED: <what's missing>" instead of assuming it.
- No invented facts: no competitor features, statistics or library behaviour you can't point to in the text.
- Give each finding a severity (Critical, High, Medium, Low), the concrete failure it would cause, and a fix.
- End with one line: "Seat recommendation: RATIFIED", "Seat recommendation: AMENDED" (acceptable once your listed fixes are made) or "Seat recommendation: REJECTED".
- Keep it under 350 words. No IDs or emails.
```

**Seat briefs** (prefix each with "You are the [Seat] seat of the [PRODUCT NAME] Council. [ONE LINE ON THE PRODUCT.]"):

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
   - whether new text can be translated.

   The design system: [DESIGN SYSTEM RULES]."
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

**Synthesis system prompt:**

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

## 7. The page (`/hq`)

Use the app's shell, navigation and design system: theme colours only, no hard-coded colour literals.

- **Header and stats:** a "Project HQ" title and description, then three stat cards:
  - active backlog tasks (not done);
  - identified risks;
  - accepted decisions (ADRs).
- **Tabs:** Tasks, Risks, Decisions, AI.
  - **Tasks:**
    - a table of title, status badge, priority badge (P0 red, P1 orange, else neutral), source and owner;
    - Add/Edit in a modal (title, status, priority, source, owner);
    - Delete with confirmation.
  - **Risks:**
    - a table of title, severity and probability badges coloured by score (≥4 red, 3 orange, else neutral), owner and mitigation;
    - Add/Edit modal and Delete.
  - **Decisions:**
    - a table of title, status (Proposed, Accepted, Rejected, Superseded), impact badge and owner;
    - Add/Edit modal and Delete.
  - **AI:**
    - **A mode switch, with `aria-label="AI mode"`:** Advisor / Council review. The heading changes with it ("AI Governance Advisor" / "AI Council"). Under it, one line of copy:
      - Council: *"Five independent reviewers (Data & API, Routes & Pages, UX & Accessibility, Feature & Plan, Security), then a synthesis. It reviews the text you give it and the register, not the code; it recommends, you decide."*
      - Advisor: *"Ask about the project's tasks, risks and decisions."*
    - **Template buttons:**
      - Advisor: "Prioritize risks" (*"From the register's risks, which three should we mitigate first, and what concrete action closes each?"*), "Check the task load" (*"Looking at the open tasks, which are blocked or at risk of slipping, and what would you cut or re-sequence?"*), and "Draft an ADR" (*"Draft an Architectural Decision Record (context, decision, consequences, rollback) for: <the decision>"*).
      - Council: "Review a feature proposal" (*"Proposal: <what it does, who it serves, the pages/routes/tables it adds or changes, how it's tested, and its definition of done>"*) and "Review a migration plan" (*"Migration proposal: <the schema change, whether code running before it deploys still works against it, how it's rolled back, and which RLS policies change>"*).
      - **Templates containing `<…>` placeholders fill the prompt box for editing. The others send immediately.**
    - **The prompt box:** an autosizing textarea, capped at about 12 rows, with a character counter against 8,000.
    - **A Send button** with a loading state and a **double-submit guard**: a ref set synchronously, not only the disabled state.
    - **The result region** is `role="status" aria-live="polite"` and is scrolled into view when the answer arrives.
      - Advisor: the response, as rendered markdown, safely sanitised.
      - Council: a **synthesis card with a status badge** (RATIFIED green, AMENDED yellow/orange, REJECTED red, no status gray), then **one card per seat** with its own recommendation badge.
      - Show the reminder that this is a recommendation and that claims should be checked before acting on them.
    - **The data note**, accurate to what you built: *"Email addresses, phone numbers and IDs are removed before a prompt is sent or saved; names and other details you type are not, so leave them out. From the register, only titles and statuses are sent, never owners or mitigation notes. Prompts go through OpenRouter to [model vendors] with zero data retention."* Never claim "no PII is stored" unless that's true.
    - **Session history:** the caller's own `hq_sessions`, newest first, with the agent name, date and a preview. Clicking one shows it read-only, with its model and cost.
- **States:**
  - a skeleton while loading;
  - "Syncing…" while records load;
  - empty states for each table;
  - a toast on save and delete errors;
  - the "not configured", "out of credits" and "busy" messages exactly as the endpoint returns them.
- **Data loading:** don't call `setState` synchronously inside an effect. Load in the async callback, and start `loading = true` for the initial load.
- **Mobile:** tables scroll horizontally, grids collapse to one column, and touch targets are at least 44px.

## 8. Limits: state these in the UI wherever the Council is shown, and in your docs

- **It reviews text, not code.** It can't read the repository, run tests or verify claims against the source, so a RATIFIED proposal can still be built wrong.
- **It doesn't replace your code-review process** or any merge mandate.
- **Its status is a recommendation.** A human owner decides.
- **Each run costs six model calls.** Keep it behind the staff gate and the per-person throttle.
- **Register text reaches the model as-is**, apart from the scrubbing.
  - A register row could try to steer the review (prompt injection).
  - The model has no tools and its output is rendered as text, so the worst case is bad advice.
  - That's one more reason the status is only a recommendation.

## 9. Configuration (document in `.env.example`; server-only, never `NEXT_PUBLIC_`)

```
OPENROUTER_API_KEY=            # primary; enables the gateway
ANTHROPIC_API_KEY=             # optional backup, used only when OPENROUTER_API_KEY is unset
AI_MODELS_HQ_ADVISOR=          # optional comma list, overrides the registry
AI_MODELS_HQ_COUNCIL_SEAT=
AI_MODELS_HQ_COUNCIL_SYNTHESIS=
AI_ANTHROPIC_MODEL_HQ_ADVISOR= # optional backup-path overrides
```

**After deploying, do one live call from `/hq`, and confirm `hq_sessions` recorded:**
- `provider = 'openrouter'`;
- the answering model;
- tokens;
- a non-null `cost_usd`.

**Remember:** most hosts only apply a new environment variable on the next deploy.

## 10. Tests (all required; make the external calls fakes, and check them against the documented contract)

**Gateway:**
- the exact URL, method and headers;
- a body containing `model`, `models`, system message first, `max_tokens`, `provider.zdr === true` and `provider.data_collection === "deny"`;
- parsing a fixture shaped like OpenRouter's documented response: the text, the answering `model` (for example a fallback), and `usage.cost`;
- PII scrubbed in the request body on both paths;
- 402, 429, 5xx and an `{error}` body on 200 each map to `AiProviderError`, with no provider text in the message;
- an empty response is an error;
- the timeout is applied, by default and per call;
- the backup is used only when the OpenRouter key is absent;
- not-configured;
- env overrides.

**Route:**
- 401 signed out, and 403 non-staff, **with no model call**;
- 500 not configured;
- 400 for a `null` body, an array, an unknown mode, an empty prompt and an oversized prompt;
- 429 after the per-person limits, with the advisor and Council having separate allowances;
- the advisor sends the scrubbed prompt plus the register;
- the register query **never selects** owner or mitigation;
- a spoofed `agentId`/`agentName` in the body is ignored in the log;
- cost, tokens, model and provider are logged;
- the 402, 429 and other mappings.

**Council runner:**
- exactly 5 seat calls (each with its own brief) plus 1 synthesis call;
- the seats run in parallel;
- status parsing: first line and last line only, markdown tolerated, a quoted status ignored, a missing status is `null`;
- usage is summed, with null costs ignored.

**Scrubber:**
- emails, UUIDs and phone formats are replaced;
- dates and plain numbers survive;
- a ReDoS string finishes in under a second.

**Page:**
- the gate redirects;
- the loading transition;
- a non-staff user never loads the register;
- the templates' fill-versus-send behaviour;
- the double-submit guard;
- the result is announced in an `aria-live` region.

**Database (if the repo has DB tests):**
- RLS denies non-staff on all four tables;
- the sessions table is own-rows-only;
- anon is revoked;
- `is_platform_admin()` takes no arguments and uses `auth.uid()`.

**End to end (if the repo has browser tests):** a staff user opens `/hq`, adds a task, risk and decision, asks the advisor (stubbed provider) and sees the answer; a non-staff user is redirected.

## 11. Definition of done

- [ ] Typecheck clean; lint 0 errors; full unit suite passes; build succeeds.
- [ ] The migration applies to a freshly reset database, is backwards-compatible, and states its rollback.
- [ ] Every new page, route and server action is registered with the repo's test-coverage mechanism, if it has one, with roles read from the real gates.
- [ ] `.env.example`, README and an ADR are updated. The ADR covers: the gateway contract, zero data retention and failing closed, the per-feature registry, the backup path, and what stays deterministic.
- [ ] The "Project HQ" nav link is visible to staff only.
- [ ] The live check is done after deploy (§9), or explicitly listed as not done.
- [ ] Your final report lists what was verified, what wasn't, and every deviation from this spec.

## 12. Don't

- Don't let any file call a model provider except the gateway.
- Don't send owners, mitigation notes or raw IDs and emails to the model.
- Don't parse a Council status from anywhere but its required line.
- Don't let one model response stand in for several seats, or present a "6/6 unanimous" vote.
- Don't return provider error text, stack traces or keys to the browser.
- Don't retry an OpenRouter request without the zero-data-retention policy.
- Don't hard-code a model id without checking it exists today.
- Don't hide HQ behind easter eggs, or let non-staff roles in.
- Don't claim something works in production without a live call to show it.
