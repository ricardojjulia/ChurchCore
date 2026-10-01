# Council Review 28 — Synthesis (S1: communication-log access follows the pages)

**Branch:** `fix/comm-log-access-s1` (`3a704f4`) vs `main`. Diff-scoped.
**Format:** first a single combined read-only agent (`2026-10-01-council-review-28-combined.md`). After GitHub's PR #165 review pointed out that the protocol requires four distinct audit agents, it was re-run as four (`2026-10-01-council-review-28-agents-1-4.md`) on the post-review branch. No agent wrote to the repo.

## Verified by the orchestrator, not just the agent

- **Finding 1 (cancel does nothing).**
  - Confirmed by reading `cancelScheduledMessageAction`.
  - `pg_policies` shows no UPDATE policy on `communication_logs`.
  - A rolled-back probe as nora updated **0 rows**.
- **Findings 2 and 3 (policy mismatch).**
  - Confirmed in `pg_policies`: `communication_delivery_events` and `communication_suppressions` select and insert use `can_manage_church`, which admits ministry leaders.
  - The two `true` suppression policies apply to `service_role` only, so they are not a hole.
- **Not a send-safety issue.** Suppression checks at send time (`send-with-suppression.ts`, `recipient-resolver.ts`) use the admin client. The mismatch affects what people *see*, not who gets emailed.
- `suppressContactAction` is church-admin only in the app. The RLS insert policy also admits ministry leaders via PostgREST: a ministry leader could suppress any member's email or phone.

The combined agent made no wrong claims. The four-agent re-run made four, all caught by reading source:
- an overstated "Critical, do not merge" for a pre-existing failure (F4);
- an accessibility claim about icon-only buttons that have text labels;
- a stale "no PR yet";
- a whole-suite test count cited as one file's.

## Consensus findings and proposed fixes

| # | Severity | Finding | Proposed fix (this branch) |
|---|---|---|---|
| 1 | High | Cancelling a scheduled message is a silent no-op; the cron still sends it | Scoped admin client (ADR 0022). Conditional update `status = 'scheduled' → 'cancelled'` with a row-count check, so a cancel that loses a race with the cron says so. Unit tests. |
| 2 | Medium | `communication_delivery_events` select and insert on `can_manage_church`: secretary sees zeros, ministry leader reads recipient contacts | Migration: move both to `can_manage_communications`. DB test per role. |
| 3 | Medium | `communication_suppressions` select and insert on `can_manage_church`: ministry leader reads and can add suppressions, secretary sees none | Same migration: both to `can_manage_communications`. DB test per role. |
| 4 | Medium | The church-admin care queue is silently empty: pastoral data is pastor-only by design | **Defer** to the §0 tracker. This is UX/copy (label it "pastor-only"), outside S1's scope. Pastoral access stays as it is. |
| 5 | Low | Stale sarah comments; control-plane sweep skip; read-only DB test; validator text | Fix the comments, drop the skip, add insert checks to the DB test, mention `platformAdminOnly` in the error. |

## Readiness

74/100 holds until fixes 1–3 land; then about 75/100.

## Pattern note

This is the fourth comms table found off the page gate (logs in Review 17 F7, then templates and DLQ were aligned, now delivery events and suppressions). The S1 fix should sweep **every** `communication_*` table and `notification_preferences`, not just the one in hand. This is the ADR 0024 "sweep the schema" lesson applied to RLS.

## Owner decision and outcome (2026-09-30)

The owner approved fixes 1, 2, 3 and 5 and deferred fix 4 to §0. Everything was implemented on this branch:

- **Fix 1.** `cancelScheduledMessageAction`:
  - reads through the user's client, so RLS still confirms visibility;
  - cancels through the church-scoped admin client with `status = 'scheduled'` as a condition;
  - fails ("already being sent") when 0 rows change.

  Unit tests cover the filters, the lost race, and a ministry leader never reaching the admin client. A DB test pins that a direct user update changes 0 rows.
- **Fixes 2 and 3.** Migration `20261001000000` (not yet on the hosted DB) also moves the `communication_delivery_events` and `communication_suppressions` select and insert policies to `can_manage_communications`. DB tests check per-role reads on all three tables, and inserts for admin, secretary, ministry leader and member.
- **Fix 5.**
  - Stale sarah comments are fixed (`auth.setup.ts`, `roles.ts`, the sweep header, the API spec title).
  - The church-admin `/control` sweep skip is gone, so nora is now asserted denied there.
  - The validator's message names `platformAdminOnly`.
- **Out of scope, noted for S2:** `lib/communications/webhook-events.ts` writes delivery events and suppressions through the request client. In a webhook that is the anon client, so those writes already fail under any policy. This is the known F4 item, which S2 covers.

**Verification (local):**
- lint: 0 errors
- 1,921 unit tests
- 67 DB tests
- `test:surfaces` OK
- `lint:migrations` PASS
- build OK
- targeted e2e: every church-admin page plus the control-plane routes passed, with one pastor test lost to the known local session drop (landed on `/sign-in`)

## PR #165 review and the four-agent re-run (2026-09-30)

GitHub's automated review (Copilot) made seven points; all were addressed:

1. **The scheduled cron's claim was unchecked** (verified). A message cancelled between the cron's fetch and its claim, or claimed by an overlapping run, was still sent. The claim now returns its rows and the cron skips when none changed. Regression test added.
2. **The insert policies mapped to the readers' roles** would let a secretary fabricate delivery events or suppressions. Every writer is server-side on the scoped admin client, so `authenticated` now has no insert policy on any of the three tables. `suppressContactAction` moved to the scoped admin client; its upsert also needed an update policy `authenticated` never had. The DB test asserts that no role, pastor included, can insert.
3. **The validator's `platformAdminOnly` exemption was untested.** A test was added.
4. **The README's communications section** had not been updated. Handled by the Documenter.
5. **The O2 row was inconsistent:** marked done while `20261001000000` is pending. Handled by the Documenter.
6. **The Council format:** one agent instead of four. The four were re-run; see above.

**The four-agent re-run added one fix:** "Add Suppression" is now hidden from non-church-admins (component test). It also produced one Documenter item, the security matrix's comms row.

**Tracked outside S1:**
- webhook writes on the anon client (F4, in S2);
- confirm dialogs for cancel and suppress (UX follow-up).
