# Council Review 23 — Agent 2: Route & Page

**Scope:** `feat/assignment-notifications-g1-5`, `83b7a2d` + `a99cfea` vs `main` (G1.5). Read-only. `npm run test:surfaces` OK (117 pages, 15 routes, 30 actions); the 4 changed or new test files pass (75/75). E2e not run.

## 1. Callers of the changed actions

- **`assignVolunteerAction`**: called from `volunteer-schedule.tsx:1394` (manual), `:1423` (burnout bypass) and `volunteer-actions.ts:2168` (auto-fill). All treat `notification` as optional and show sent/skipped/failed via `describeNotification`. (`ccm-actions.ts:943` is an unrelated function of the same name.) The onboarding and local-SQL inserts don't notify, consistent with the Supabase-only mandate.
- **`applyPlanAutoFillAction`**: only caller `volunteer-schedule.tsx:1371`; each row shows its own outcome (`:2385`); wrapped in try/catch.
- **`sendVolunteerReminderAction`**: only caller `volunteer-schedule.tsx:1488`; a logged-but-not-sent reminder shows as an error. The `channel` input no longer decides delivery (`chooseChannel` does); the only caller passes none.
- `notifyVolunteerOfShift` catches everything. No ignored result, no unhandled throw.
- **Find replacement** (`volunteer-schedule.tsx:2228`) shows only while `pos.filled < quantityNeeded`; declined shifts don't count as filled.

## 2. The links in the messages

- `/portal/volunteer/confirm/<token>` exists, looks the token up with the admin client and checks expiry; it links on to `/portal/volunteer/schedule/<token>`.
- The base URL is `process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"` (`volunteer-actions.ts:2561`, and `:1491`), while the rest of the app uses `:4200` (`.env.example`, `lib/communications/unsubscribe.ts:17`, Playwright, CI). `??` also lets an empty string produce a relative link.

## Summary

| Surface | Change | Callers OK? | Notes |
|---|---|---|---|
| `assignVolunteerAction` | returns `notification` | Yes (3) | send runs before the admin sees the result |
| `applyPlanAutoFillAction` | per-row notification | Yes | sends run sequentially |
| `sendVolunteerReminderAction` | actually sends | Yes | `channel` argument effectively ignored |
| Schedule detail page | Find replacement, blockout reason | n/a | replacement list can include the decliner |
| `/portal/volunteer/confirm/[token]` | now reached by email/SMS | n/a | "14 days" wording out of date |
| manifest | 3 test entries | OK | one inaccurate (6) |

## Top issues

1. **"Email sent." with no provider configured** (verified): `sendgrid-adapter.ts:67-71` returns `accepted: true` with a stub id when keys are missing, in every environment; Twilio the same (`twilio-adapter.ts:55`). Pre-existing; G1.5 is the first code to present it to an admin as delivered.
2. **Wrong base URL can reach volunteers** (verified in code; production impact inferred). A deploy without `NEXT_PUBLIC_APP_URL` emails a dead `localhost:3000` link. Fail closed or share one resolver with `unsubscribe.ts`.
3. **The decliner can be offered as the replacement** (inferred). `get_volunteer_pool` and the same-day check ignore declined shifts, so the person who just declined can rank top for the same date. The e2e only checks that suggestions are visible.
4. **Confirm page states the wrong expiry** (verified): `app/portal/volunteer/confirm/[token]/page.tsx:30` still says "expire after 14 days".
5. **E2e gaps** (verified): the decline is checked only through UI text, not `confirmation_status = 'declined'` in the DB; cleanup deletes `communication_logs` by subject across tenants; the `createShiftWithoutToken` comment ("only reminders create tokens today") is stale.
6. **Manifest** (verified): `volunteer-schedule.test.tsx` was added to the list page `/app/church-admin/volunteers/schedules`, but it renders only the detail page's `ServicePlanBuilder`.
7. **Auto-fill latency** (inferred): each assignment awaits its provider call in a sequential loop; minor at MVP scale.

No blocking route or page defects. Fix 1 and 2 (and ideally 4) before merge.
