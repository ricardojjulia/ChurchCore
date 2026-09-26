# Council Review 19 — Agent 4: Feature & Competitive Audit

**Branch:** `feat/service-planning-rotation-planner`, diff-scoped to commit `eca7bb1` (Service Planning Story 3).

**Verdict:** no blockers. MVP readiness **70/100 (+1 from 69)**. The biggest gap: blockout dates, one of the planner's inputs, have no way to be entered.

## 1. Story 3 acceptance vs. shipped
There is no committed Story 3 brief, so this is judged against DEVELOPMENT_PLAN.md: "fatigue- and history-aware volunteer suggestions (wires `burnout-calculator`)".

**Shipped (verified):**
- Ranking: eligibility → skills → 30-day load → time since last served → name.
- Four ineligibility reasons: blocked, same day, monthly limit, high load.
- Whole-plan auto-fill with review, where each person is used at most once.
- Re-validation on apply, then assignment through `assignVolunteerAction`.
- Monthly limit column and input.
- Two SECURITY INVOKER SQL functions.
- Unit, action, loader, real-Postgres and e2e tests.

**Partial:**
- **Burnout is not wired to `burnout-calculator`.** The threshold is copied, and the 30-day windows differ slightly. The rare `BURNOUT_WARNING` at apply is handled cleanly by the per-row results.
- **Role history isn't used.** `roleServedCount` is shown but not ranked; people who have never served rank as most rested.

## 2. vs. Planning Center Services
| Capability | ChurchCore |
|---|---|
| Auto-scheduling | Partial: one plan at a time, not multi-week |
| Blockout dates | **Schema only.** Nothing in `app/`, `components/` or `lib/` writes `volunteer_blocked_dates`; only the seed does |
| Preferred frequency | Partial: an admin-set hard cap; volunteers can't set it themselves |
| Household "schedule with" | Missing |
| Team rotation / fairness | Partial |
| Accept/decline | Token pages exist. Assignment, auto-fill included, sends nothing (inferred) |
| Cross-team conflicts | Same-day match; no time-overlap check |

**Remaining gaps, ranked by adoption impact:**
1. Volunteer self-service blockouts.
2. Assignment notifications, and a replacement suggestion after a decline.
3. Scheduling several weeks at once.
4. Household "schedule with".
5. Volunteer-set frequency.

## 3. What remains for gap 1
- Stories 4 (rehearsals) and 5 (make `event_id` required).
- Missing from the plan: blockout entry and assignment notifications.
- Gap 1 is about **85% closed**, up from about 75%.

## 4. Scores
- **Volunteer Scheduling module: 84%, up from 80%.** The 80% was generous, since the picker and directory were empty in production.
- **MVP readiness: 70/100 (+1).** Not +2, because without blockouts and notifications the planner is admin-only in practice.

## 5. Top findings
1. **(High for adoption)** Blockout dates can't be entered, so the planner will suggest people who are away.
2. **(Medium-High)** A role with no required skills can be auto-filled with any non-merged church member. Restrict the pool to known volunteers, and use `roleServedCount` in ranking.
3. **(Medium)** Assignments, auto-fill batches included, notify nobody.
4. **(Low-Medium)** `burnout-calculator` isn't wired; the threshold is duplicated.
5. **(Positive)** Real production fixes: the empty picker and directory, the shift-window CHECK violation, the missing Supabase same-day check, and the dot-notation crash. CI now runs `test:db`.
