# Council Review 23 — Agent 4: Feature & Competitive

**Scope:** `feat/assignment-notifications-g1-5` (`83b7a2d`, `a99cfea`), 15 files, +900/−94. The 4 G1.5 test files pass (75/75); e2e and CI not run by this agent.

## 1. G1.5 definition of done

| Clause | Status | Evidence |
|---|---|---|
| Manual and auto-fill both notify | Done | `assignVolunteerAction` → `notifyVolunteerOfShift`; `applyPlanAutoFillAction` goes through it. Tests `rotation-planner-actions.test.ts:258,366`, "shows each auto-filled volunteer's notification outcome" |
| Email or SMS by preference | **Partial** | `chooseChannel` is right on its own, but in the full pipeline SMS is skipped for every volunteer who prefers it (finding 1) |
| Existing comms pipeline | Done | `sendWithSuppression` → `queueCommunicationAction`; the e2e checks the `communication_logs` row and the link in the body |
| Consent and suppression respected | Done | `contact_allowed`/`'none'` checked, then suppression, then `notification_preferences`; test "respects a do-not-contact request and the suppression list" |
| Decline shows top replacements | Done (one click away) | "Find replacement" opens the assign modal with the ranked list; not shown inline, no alert to the admin on a decline |
| Every assignment gets its own token, shift date + 7 days | Done | `ensureShiftToken` + `tokenExpiryFor`; e2e checks the exact expiry; the fixed 14-day code is gone |
| Roster shows the blockout reason | Done | `lib/volunteer-data.ts` `unavailableReasons`; test "shows the reason when an assigned volunteer has blocked the date" |
| Tests including assign → decline → replacements | Done | `service-plan-rotation.spec.ts` journey; unit, action and component tests in the manifest |

7 of 8 Done, 1 Partial. The tracker row still says "Not started".

## 2. Real Supabase, real users

- Token confirm and decline work for a visitor with no login (verified by reading): the lookup and response use the admin client, by token and expiry, update by `shift.id`. No row-count check on that update.
- Admin writes line up with RLS (`canManageServicePlans` = `can_manage_church`).
- **SMS never actually sends** (verified in code and local DB): `checkOptIn` treats "no preferences row" as SMS off and the column default is `sms_opt_in = false`; all 5 local SMS-preferring profiles have no row, so each is skipped with no email fallback. The action test mocks `sendWithSuppression`, so it doesn't catch this.
- **Deliveries can be faked**: SendGrid and Twilio adapters return `accepted: true` with a `*-stub-*` id when keys are unset, in any environment, so a keyless production deploy shows "Email sent." and logs `sent`. Same class as Review 22's donation stub. Resend isn't wired (G5.1/F2).

## 3. Gap 1 and re-estimate

G1.4 done, G1.5 close, G1.6 (church-timezone days, 0.5 day) open; Gap 1 also needs the journeys green in CI. **Doc inconsistency:** Gap 1's definition of done still lists "rehearsal" among the journeys though G1.7 moved after MVP. Volunteer Scheduling ~86% (from 80%), 88–90% once findings 1–2 and G1.6 land. **MVP readiness 70/100** (+1): deliveries still depend on stubbed or unwired providers and G1.6 is open.

## 4. M1 (Fri Oct 2)

Achievable but tight: this PR fixed and merged through a green CI e2e, plus G1.6, in 3 working days. If G1.6 slips, Gap 1 closes Oct 5, and the Nov 6 plan has no buffer.

## 5. Top findings

1. [V] SMS-preferring volunteers get no message at all; fall back to email.
2. [V] Stub adapters report success; gate on non-production/demo, or report "not configured" as failed.
3. [V] Stale copy: the confirm page says links "expire after 14 days".
4. [V] Replacements one click away, and nobody is alerted on a decline — meets the DoD as written; weaker than Planning Center's decline alerts. Stretch candidate.
5. [I] The token-response update has no row-count check; messages are English-only (no stored volunteer language, relevant to `es-PR` churches); the e2e admin fixture may bypass RLS as platform admin (S1's gap).
