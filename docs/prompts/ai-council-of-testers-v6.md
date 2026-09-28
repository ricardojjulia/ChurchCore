# Testing Council v6: the Omni-Council protocol, applied to ChurchCore

**Supersedes:** `docs/prompts/ai-council-of-testers-v5.md` (kept for history).
**Source:** the owner's "Orthos Omni-Council Engine" specification, 2026-09-27, adopted in full as the testing council's protocol. This file maps each part of it onto what ChurchCore actually has.
**Entrypoints:**
- `.claude/skills/test-council/`
- `.codex/skills/churchcore-test-council/`
- `.gemini/skills/gemini-test-council/`

The testing council is the **behavior** council. It drives the running app as many personas and tries to break it. The Council in `improve-software.md` is the **code** council, which reads diffs and audits architecture. The two complement each other, and neither replaces the other.

---

## Part 0. Ground rules (these override anything below)

1. **Test what exists; never invent it.**
   - The surface inventory is `tests/coverage-manifest.json`: 117 pages, 15 API routes and 30 server-action modules at the time of writing. Re-count it at the start of every run.
   - The specification was written for a wider product family ("Orthos v0.6.0", "31 routes", "20 governance domains"). Anything it names that ChurchCore doesn't have is reported as **Not present**, never as a pass. When a missing feature matters competitively, the report says so, and it becomes a roadmap row or a §0.5 entry.
2. **Local Supabase only.**
   - Runs use the e2e environment (`npm run test:e2e:local`, `supabase/scripts/setup-e2e.sh`).
   - The guard in `tests/e2e/fixtures/env.ts` (`assertLocalSupabaseHosts`) must pass.
   - Never read, print or use `.env.local`, which holds hosted and production credentials.
   - Never send real email or SMS: provider keys stay blank, so every provider runs in stub mode.
3. **"Auto-remediate" means a proposal, never an auto-merge.**
   - Every defect gets a root cause, a mitigation and a patch.
   - Patches land only through the normal factory: a feature branch, tests that reproduce the defect first, the code Council, the Documenter, and a PR with green required checks.
   - The testing council never commits to `main` and never weakens a test to make it pass.
4. **Every finding is tracked.**
   - Each defect becomes a row in `DEVELOPMENT_PLAN.md` §0.3: a `B-n` row, or the next ID in its gap or track.
   - If it's deliberately deferred, it goes in §0.5 with a reason.
   - Nothing lives only in the report.
5. **Evidence, not narrative.**
   - Every pass or fail in the report cites something that can be re-run or inspected: a Playwright trace, a screenshot, a DB query or a ledger entry.
   - An agent's summary that contradicts its own evidence is a synthesis error (see the `feedback_council_synthesis_scrutiny` memory).

---

## Part 1. Persona matrix

### 1.1 Real identities in ChurchCore

These are the sessions a persona can actually hold:

| Identity | How the session is made | Home |
|---|---|---|
| `super-admin` | Control-plane login (`tests/e2e/fixtures/roles.ts`) | `/control` |
| `church-admin` | Tenant login plus membership | `/app/church-admin` |
| `secretary` | Tenant login plus membership | `/app/secretary` |
| `pastor` | Tenant login plus membership | `/app/pastor` |
| `ministry-leader` | Tenant login plus membership | `/app/ministry-leader` |
| `member` | Tenant login plus membership | `/app/member` |
| Anonymous | No session | Public pages and API routes |
| Volunteer-link holder | A shift's `confirmation_token`, with no login | `/portal/volunteer/confirm/[token]` and `/portal/volunteer/schedule/[token]` |
| Second-church admin | A login with a membership in a *second* church. **The local seed has only one church** (checked 2026-09-27), so the run creates the second church, its admin, and a few of its own rows (people, a plan, a shift, a blocked date, a donation) in the local DB at the start, and removes them at the end | Used for cross-tenant probes |

**Session isolation** (the specification's "isolated cryptographic cookie jar / JWT") is each identity's own Playwright `storageState` (`tests/e2e/.auth/<identity>.json`), run in its own browser context. DB-level probes run as the `authenticated` role with that identity's JWT claims, following the pattern in `tests/database/volunteer-pool-functions.test.ts`.

### 1.2 The 20-persona baseline, mapped

- **Active:** exercised against real ChurchCore surfaces.
- **Adapted:** the persona's intent is kept, pointed at ChurchCore's nearest real feature.
- **Inactive here:** ChurchCore has no such feature. The persona activates when the testing council targets a product that does (for example ChurchCore LMS or Academy), or when the feature is built.

| # | Persona | Aptitude | Identity used | What it exercises in ChurchCore | Status |
|---|---|---|---|---|---|
| 1 | SYSTEM_ADMIN | Expert | super-admin | `/control`: tenant lifecycle, provisioning, billing, support, tenant view, erasure | Active |
| 2 | FORENSIC_AUDITOR | Expert | church-admin | Finance: journals balance (debits = credits), budgets, account balances vs. entries, giving reconciliation, imports (`/app/church-admin/finance/*`) | Active (adapted) |
| 3 | LEGAL_COUNSEL | High | church-admin, member | Consent capture and immutability, data-rights export and erasure (`/app/member/data-rights`), retention, unsubscribe compliance | Adapted |
| 4 | BOARD_CHAIRMAN | Medium | pastor | Elders and council workspaces (`/app/elders`, `/app/council`), meeting timelines, queues | Adapted |
| 5 | INSTRUCTOR / PROFESSOR | Medium-High | none | Courses, modules and uploads | **Inactive here** (ChurchCore LMS). Nearest: the pastor Bible-study tools, covered in the pastoral pathway |
| 6 | TEACHING_ASSISTANT | High | none | Speed-grading | **Inactive here** (ChurchCore LMS) |
| 7 | EXECUTIVE_SECRETARY | Expert power user | secretary | Hyper-fast input, double submits, keyboard-only flows, communications compose, people data entry | Active |
| 8 | VOLUNTEER_DIRECTOR | Medium | ministry-leader, church-admin | Service plans, rotation planner, auto-fill, blockout dates, child-safety pairing and check-in | Active |
| 9 | TRUSTEE_KEYHOLDER_A | Expert | none | Multi-key cryptographic unlock | **Inactive here**: no dual-key feature. Nearest real control: the pastoral-note encryption key (persona 13) |
| 10 | TRUSTEE_KEYHOLDER_B | Expert | none | As above | **Inactive here** |
| 11 | CRISIS_INCIDENT_COMMANDER | High | church-admin | Simultaneous multi-channel broadcasts (email and SMS), suppression and consent, retry and DLQ, rate limits | Active |
| 12 | ACADEMY_OPERATIONS_MANAGER | Medium-High | second-church admin | Cross-tenant probing: church A's session against church B's ids through pages, server actions, PostgREST and RPCs | Adapted (tenant = church) |
| 13 | CYBER_SECURITY_DPO | Expert | member, church-admin | Privacy toggles, data export and erasure, pastoral notes encrypted at rest (ciphertext in the DB), cookie flags, unsubscribe tokens | Active |
| 14 | INTERNAL_CONTROLS_DIRECTOR | High | super-admin, church-admin | `/hq` governance, `audit_log` coverage of sensitive operations, page gate vs. RLS mismatches (the F7 class) | Active |
| 15 | VAULT_ARCHIVIST | High | church-admin | Immutable records: consent log (update and delete refused), `audit_log`; year-end giving statements once G3.3 ships | Adapted |
| 16 | TRADITIONAL_STUDENT | High | none | Quiz timers, module speed-runs | **Inactive here** (ChurchCore LMS) |
| 17 | AUDIT_NON_TRADITIONAL_STUDENT | Low | member | Kept as a *low-aptitude member*: confused by layout changes, at 375px and in Spanish; hits every error and empty state | Adapted |
| 18 | WHISTLEBLOWER_ANONYMOUS | Low | anonymous | Public pages and the portal: telemetry and cookie leaks, identity isolation, nothing personal in the HTML or network responses | Active |
| 19 | PARENT_OBSERVER | Low | member (guardian) | Family and child check-in as a guardian; deliberately tries other families' children, other members' records, and staff-only actions | Active |
| 20 | OUTSIDER_ATTACKER | Expert | anonymous, forged token | Direct links to `/app/*`, `/control`, `/hq`, API routes; POSTs to server actions; cron without `CRON_SECRET`; unsigned webhooks; guessed and expired volunteer tokens | Active |

### 1.3 On-the-fly personas

When a surface needs a workflow or permission layer that no baseline persona covers, **spawn one**. Examples:
- a volunteer-link holder whose token has expired;
- a ministry leader who also volunteers;
- a secretary with no volunteer history.

A spawned persona must:
1. **Map to a real identity** from 1.1, or to a real token or fixture. Never invent a role the app doesn't have.
2. **Be recorded** in the ledger and the report: name, aptitude (Low / Medium / High / Expert), objective, identity, and why it was spawned.
3. **Get isolated state** (its own browser context and storageState). Extra auth users or memberships go in the *local* DB and are removed at the end of the run.

---

## Part 2. Interlocking pathways and the SharedCouncilMemory ledger

Each run writes the ledger to `test-results/testing-council/<run-id>/ledger.jsonl`, one JSON object per step. Hand-offs between personas read identifiers from it:

```json
{
  "council_state": {
    "active_pathway": "PATHWAY_NAME",
    "shared_context_variables": { "global_entity_id": "STRING", "cryptographic_checksum": "HEX_STRING" },
    "prior_step_footprint": {
      "persona": "STRING",
      "route": "STRING",
      "last_interacted_coordinates": [0, 0],
      "session_cookie_isolated": true
    }
  }
}
```

- **`cryptographic_checksum`** is the SHA-256 of the entity as the step last observed it: the relevant row(s) read from the local DB, as canonical JSON. The next persona recomputes it. A mismatch nobody expected is a state dropout.
- **`last_interacted_coordinates`** is the centre of the clicked element's `boundingBox()`.
- **`session_cookie_isolated`** is true only when the step ran in its persona's own context.

### Core pathways

These are the multi-persona hand-offs ChurchCore actually has.

- **Service planning:** admin builds a plan → auto-fill → the volunteer confirms or declines by link → blockout dates → the admin sees the roster change.
- **Communications:** a secretary composes → an admin sends a broadcast → suppression and consent are applied → the log appears for the right roles only (F7) → retry and DLQ.
- **Child safety:** the guardian checks a child in → the kiosk → staff check the child out with authorized pickup → incident report.
- **Giving and finance:** a member gives → receipt → the admin posts to the ledger → journals balance → reports. Recurring gifts and statements once G3 ships.
- **People:** visitor registration → admin approval → household → member directory visibility.
- **Pastoral care:** a pastor writes a note → it's encrypted at rest → it's visible to the right roles only.
- **Platform:** super-admin provisions a tenant → church-admin setup → the tenant view is audited.

### The four lenses (every pathway runs through all four)

1. **Physical and spatial.**
   - ChurchCore has no floating canvas.
   - It applies to drag-and-drop (the run-of-service and setlist, `dnd-kit` in `components/application/volunteer-schedule.tsx`), modals, sticky and bottom navigation, and layouts at 375, 768 and 1440px.
   - Record bounding boxes, and assert all of these:
     - interactive elements don't overlap;
     - they stay in the viewport, or can be scrolled into it;
     - touch targets are at least 44px;
     - drag-and-drop works by pointer *and* keyboard;
     - nothing becomes unclickable after a drag or a reflow.
2. **Functional flow.** Each pathway's entity must be visible and correct to every downstream persona, with no state dropout.
3. **Boundary and load stress.**
   - **Malformed and extreme input:** very long strings, Unicode and RTL text, emoji, HTML and script payloads, SQL-shaped strings, impossible dates.
   - **Oversized uploads and imports:** the CSV import limits.
   - **Friction:** out-of-order steps, double submits, two tabs at once, going offline mid-step, throttled networks.
   - **Concurrency:** run truly concurrent writes on the same entity (for example two auto-fill applies, FS3-3) and record exactly what happens.
4. **Security and RLS isolation.**
   - Probe every read and write path with the wrong church's session, a lower role, an anonymous request and a forged token.
   - Cover pages, server actions (direct POSTs), API routes, PostgREST and RPCs.
   - **Any cross-tenant data in a response halts the run and is a Critical defect.**

---

## Part 3. The per-surface cycle

Run this cycle for **every** page, API route and server-action module in `tests/coverage-manifest.json`.

1. **Discovery.**
   - Read the page, route or action source.
   - List every interactive component, input, drag-and-drop area and upload zone, and every server action and database table it touches.
2. **Persona assignment.**
   - Take the authorized personas from the entry's `allowedRoles`, which are verified against the code.
   - Spawn any persona the surface needs (see 1.3).
   - Assign at least one unauthorized persona as the perimeter probe. The page×role sweep already proves denial; the council goes further, into actions, APIs and data.
3. **Simulation.**
   - **Happy path:** the intended workflow, with role and label locators first and coordinates recorded.
   - **Friction:** double-click submits, switch tabs mid-flow, throttle and drop the network, drag out of bounds.
   - **Hand-off:** write the entity to the ledger, switch to the next persona's context, and continue.
   - **Perimeter attack:** direct URL access, a direct server-action POST, API and PostgREST calls, and a replayed or expired token.
4. **Assertions.**
   - **Platform:**
     - no console errors beyond `tests/e2e/fixtures/console-allowlist.ts`;
     - no unexpected HTTP status ≥ 400;
     - no stack traces or raw database messages shown to the user.
   - **Security:** RLS is intact, and no data crosses roles or tenants.
   - **Visual:** no overlaps, text is legible, controls stay clickable after movement and reflow, WCAG 2.1 AA contrast.
   - **Integrity** (the specification's "Cryptographic" assertion, mapped to ChurchCore's real controls; ChurchCore has no SHA-256 document vault):
     - pastoral notes are ciphertext in the DB;
     - the consent log refuses update and delete;
     - `audit_log` rows are written for sensitive operations;
     - unsubscribe and webhook signatures are verified (HMAC);
     - child check-in PINs are stored hashed;
     - volunteer tokens are single-shift scoped and expire.

     If a signed-document vault is built, add SHA-256 signature checks here.
5. **Remediation planning**, for each failure:
   - the root cause, down to the file and line;
   - an immediate mitigation;
   - a patch as a diff, plus the test that proves the defect;
   - the tracker row it becomes.

   Patches follow Part 0.3.

---

## Part 4. Report

Save the report as `docs/reviews/YYYY-MM-DD-testing-council-<n>.md`, with traces and screenshots under `test-results/testing-council/<run-id>/`. Use exactly this structure. Sections 5–7 are ChurchCore additions, and are required.

```markdown
# 🏛️ Omni-Council Comprehensive Master Governance Audit
**System Timestamp:** [ISO] | **Active Framework Mode:** Maximalist-Exhaustive E2E
**Target:** ChurchCore @ [branch / commit SHA] | **Environment:** local Supabase (guard passed)
**Total Active Routes Audited:** [pages / API routes / action modules, out of the manifest totals] | **Dynamic Personas Spawned On-The-Fly:** [Count]

## 👥 1. Persona Lifecycle & Session Verification Matrix
*   **[Persona Name 1]:** [Pass/Fail State | Session Token Status | Key Signatures Verified]
*   **[Persona Name 2]:** [Pass/Fail State | Session Token Status | Key Signatures Verified]
*   **[Dynamically Spawned Persona X]:** [Exposed Context | Reason for Spawning | Validation State]

## 🛣️ 2. Comprehensive Interlocking Feature Matrix & Route Analytics
### Route Endpoint: `[e.g., app/app/church-admin/volunteers/schedules/[id]/page.tsx]`
- **Active Governance Domains Evaluated:** [ChurchCore modules, e.g. Service Planning, Child Safety, Finance]
- **Tested Pathways:** [e.g., Service planning: build → auto-fill → confirm by link]
- **Spatial UI Coordinates Inspected:** `[X: Min/Max, Y: Min/Max Bounds]`
- **Functional Status:** [100% Operational / Deficiencies Detected]

## 🚨 3. System Deficiencies, Leakages, & Structural Faults
### Defect ID: [OMNI-XXXX] | Severity: [CRITICAL SECURITY / HIGH / SPATIAL UX / MATH OVERFLOW / LOW]
- **Target Route / Feature Layer:** `[explicit path and file path]`
- **Persona & Pathway:** [who found it, on which pathway]
- **Evidence:** [trace / screenshot / query / ledger entry]

## 🛠️ 4. STRATEGIC REMEDIATION BLUEPRINT & ENGINEERING CODE PATCHES
### For Defect: [OMNI-XXXX]
- **Root Cause Determination:** [why it happened under stress, down to file:line]
- **Immediate Mitigation Strategy:** [step-by-step hotfix to stabilize now]
- **Remediating Code Patch:** [a diff or TypeScript block, plus the test that reproduces the defect first]
- **Tracker Row:** [ID added to DEVELOPMENT_PLAN.md §0.3, or the §0.5 entry]

## 🧭 5. Not Present in ChurchCore
[Personas, lenses and features from the specification that don't apply here, each with the reason and whether it should become a roadmap row]

## 📋 6. Coverage Accounting
[Surfaces run vs. manifest totals; any surface skipped, and why; flaky results re-run and their outcome]

## ✅ 7. Verdict
[READY / BLOCKED. Blocked on any Critical, or any High in a pathway the MVP release checklist depends on]
```

---

## Invocation

```text
EXECUTE_OMNI_COUNCIL --mode=MAXIMALIST_EXHAUSTIVE --target="ChurchCore @ <branch or SHA>" --auto-remediate=propose
INSTRUCTION: Initialize full testing cycles over every page, API route and server-action module in tests/coverage-manifest.json, feature by feature, page by page, persona by persona, against local Supabase only. Run all four lenses and all core pathways. Spawn personas on the fly where a surface needs them. Map every failure to a root cause, propose a patch with its reproducing test, add a tracker row for it, and write the Master Governance Audit report.
```

- `--auto-remediate=propose` is the only allowed value (Part 0.3). The specification's `=true` is read as `propose`.
- A **targeted run** (`--mode=TARGETED --surfaces=<manifest keys>`) uses the same protocol on the surfaces a PR touches. It's optional per PR.

**When the full run is required:**
- **At milestone M3** (2026-10-16), to catch defects while there's time to fix them.
- **At M5** (2026-10-30), as part of R1, the whole-app re-baseline before the MVP release.

A full run's Critical and High findings must be resolved or explicitly deferred by the owner before release.
