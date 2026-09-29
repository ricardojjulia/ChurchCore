# Council Review 22 — Agent 4: Feature & Competitive

**Scope:** `fix/member-writes-rls-s8` at `4377e49` vs `main` (S8). Read-only; local DB selects only. Ran the 5 changed and related unit test files: 44 of 44 pass. [V] = verified in source or `pg_policies`; [I] = inferred.

## 1. S8 definition of done

| Item | Status | Evidence |
|---|---|---|
| Giving: row before PaymentIntent, admin client, errors returned | Done | Tests "writes the pending row before…", "never calls Stripe when the row can't be written" |
| Giving: confirmation not trusted from the client | Done (beyond scope) | `retrievePaymentIntentStatus` + `.eq("status","pending")`; test "refuses when Stripe hasn't confirmed" |
| Mobile check-in | Partial | Admin-client insert fixed, but every `memberMobileCheckInAction` unit test runs the local-SQL path, so the changed Supabase path has no test, and there's no e2e journey |
| Group join | Done | `group-join-actions.test.ts` (3) and the e2e join journey |
| RSVP | Done | Migration `20260929000000`, DB tests, e2e RSVP. `respondToCalendarEventRsvpAction` still throws (out of scope) |
| Registration capacity and payments | Done / Partial | Admin count, duplicate check, payment upsert; e2e full-event journey. A payment upsert error is only logged — the member sees success with no payment row |
| Data-rights 0-row checks | Done | `setOwnDataRightsField` `.select("id")` + length check |
| Errors returned, not thrown | Done | `DataRightsResult`, `InitiateDonationResult` |
| DB harness | Done | `tests/database/member-writes-rls.test.ts` |
| "Every member-reachable write audited" | Partial | No audit inventory ships; at least one write was missed (§2) |

## 2. Member writes S8 did not cover

- **`member_change_requests` re-submit [V].** `app/app/actions.ts:503-515` finds the member's pending request (SELECT allows it), then `.update(...)`s it, but the only UPDATE policy is `member_change_requests_update_manage_scope` (`can_manage_church`). The update matches 0 rows with no error and the old id is returned, so a member who edits their profile or family while a request is pending sees "pending review" and the new changes are lost.
- **`notification_preferences` [I, high confidence].** `communications-actions.ts:568` upserts with no `onConflict`; the PK is `id` and the unique key is `(church_id, profile_id)`, so the second save should hit 23505 and throw. Fails loudly, not silently.
- **[I]** Several self policies use `(select profiles.id … where user_id = auth.uid() limit 1)` with no church filter (`event_registrations_select_own`, `notification_preferences_*`, `consent_logs`). A member of more than one church can match the wrong profile. S9 territory.
- Checked and OK [V]: blockouts, push subscriptions, `consent_logs` insert, `updateMemberProfileAction`, `respondToShiftAction`.

## 3. Module completion (vs. Review 21)

- **Giving: ~45% → ~48%.** Correct ordering, Stripe-verified confirmation, own-gift cancel. But no card can be charged online (G3.0) and recurring giving doesn't exist (G3.1). The gain is correctness, not capability.
- **Events & Registrations: ~55% (re-based) → ~70%.** RSVP always failed and member and public registration options were always empty; S8 fixes all three and enforces capacity. Check-in untested on Supabase.
- **Member-portal writes: ~40% → ~62%.** Change-request and preferences gaps remain; S9 not done.
- **Volunteer Scheduling: ~80%, unchanged.** Capped until G1.5, which S8 unblocks.

## 4. MVP readiness: 69/100 (Review 21: 67)

Re-based to 66 first: Review 21's "above 71 after S8" assumed giving would work once RLS was fixed, and G3.0 shows online card giving never could charge. S8 then adds about 3 for member self-service writes. It doesn't clear 71; that needs G3.0 plus the change-request fix.

## 5. Competitive and M1

Gap 3 now costs G3.0 + G3.1 = 3 days, not 2. Nothing here closes Gap 1. M1 (Oct 2) needs S8 merged, S9 and G1.5 in about 3 days — plausible only if S8 merges today. Must work is 37 days against 25 (about 48% over); recommend the owner take the date-vs-scope decision now rather than on Oct 2.

## 6. Top 5

1. [V] A re-submitted member change request is silently lost (`actions.ts:503-515`).
2. [V/I] Stub mode records succeeded gifts and sends receipts whenever `STRIPE_SECRET_KEY` is unset. Needs a production guard.
3. [V] G3.0: online card giving can't charge. A Must blocker for Gap 3.
4. [V] The mobile check-in Supabase path changed in S8 is untested at unit and e2e level.
5. [I] A second `notification_preferences` save should throw on the unique key; a failed paid-registration payment upsert is logged while the member is told it succeeded.
