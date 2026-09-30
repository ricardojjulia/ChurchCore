# Council Review 25 — Agent 4: Feature & Competitive

**Scope:** `test/service-plan-build-journey-g1-11`, commit `1233705` vs `main` (G1.11). Read-only; local DB selects.

## 1. Gap 1 journey clauses

| Clause | Test | Status |
|---|---|---|
| Build a plan | build spec step 1 (dialog → builder URL → DB row and event) | covered |
| Add songs | build spec steps 2–3 (create and add; add again from the library; library count stays 1) | covered |
| Assign by hand | build spec step 5; rotation spec | covered |
| Auto-fill | build spec step 6 (new plan); rotation spec | covered |
| Notify | rotation spec (log row and link, manual assign only) | covered; auto-fill notification only unit-tested |
| Accept | rotation spec (emailed link → DB `confirmed`) | covered |
| Decline | rotation spec (DB `declined`, then replacements) | covered |

The spec hasn't run in CI yet, so the "pass in CI" clause isn't met until it does. Small interference risk with `fullyParallel` and shared volunteers.

## 2. Is G1.8's first half enough?

Yes for the core flow: 0 local plans with a null `event_id`; `volunteer_shifts.event_id` is NOT NULL, so this was a real bug. The FK is `ON DELETE SET NULL`, and `ensurePlanEvent` covers that on the next assignment. Remaining: **the new event goes to members** (`visibility = 'members'`, `rsvp_enabled = true`), and a cancelled plan's event stays live; clearing the linked event can split one plan's shifts across two events; the deprecated local path doesn't create an event.

## 3. Gap 1 and M1

Gap 1 closes when this merges with a green CI `e2e`. Nothing else blocks M1. **Volunteer Scheduling ~90%; MVP 72/100** (+1; deliveries still depend on G5.1).

## Top 5

1. (V) A severe latent bug fixed: a plan without a linked event could never be staffed.
2. (V) Journey clauses fully mapped across the two specs, but not yet run in CI.
3. (V/I) Auto-created events are members-visible with RSVP on. Recommend `visibility = 'leaders'` and `rsvp_enabled = false`, or a follow-up row.
4. (I) Clearing the linked event can split shifts across two events.
5. (V) The unfilled-count fix is real and unit-tested; auto-fill notification has no journey coverage.
