# Council Review 27 — Agents 2 and 3 (combined): Route & Page, UX & Shell

**Scope:** `fix/hq-role-tenancy-s5`, commit `43d0305` vs `main` (S5). Read-only. **Verdict:** no blocker in the pages and flows; three follow-ups, one security-relevant.

## 1. Member self-saves (verified)

Profile edit (`app/app/actions.ts:606-617`), family (`:755-786`), data rights (`lib/compliance/data-rights-actions.ts:41-44`, the *requested* columns), push subscribe, onboarding and mobile write no protected column. Server-side paths (invite accept, member add) use the admin client, so the trigger lets them through. If the trigger's error ever surfaced, callers `throw new Error(error.message)`, so it would show as a generic action failure.

## 2. Staff flows

People edit, bulk edit and deactivate (`requireChurchAdminSession`) are unaffected; editing yourself is fine for church_admin; removing your own admin access is already refused (`actions.ts:311-360`). The membership snapshot trigger rewrites `profiles.role`, `church_id` and `is_pastoral` under the caller's uid — safe today, but a future self-demote or leave-church flow would hit the trigger (inferred). People import (`member_number`) is church-admin only. **Gap (inferred, medium):** the exemption uses `can_manage_church`, which includes pastor and ministry_leader, so they can still self-set `safety_clearance_date`, `data_delete_approved_*`, `is_pastoral` and `membership_status` through PostgREST. Roles can't escalate (they come from memberships), but a self-set clearance feeds the clearance report (`lib/ministry-forge-data.ts:1497`). Decision needed: exempt only church_admin and platform admins, or record the residual risk.

## 3. /hq

No link outside `app/hq/` points at `/hq`. The page's `manager`/`teacher` branches are dead code. **`/api/ai`** (the HQ AI advisor, called from `app/hq/page.tsx:395`) checks only `auth.getUser()` (`app/api/ai/route.ts:29-33`), so any signed-in member can spend Anthropic credit; its `hq_sessions` insert now fails RLS silently. **Stale sweep entry:** `KNOWN_BUGS["secretary /hq"]` (`tests/e2e/page-role-sweep.spec.ts:75-81`) blames `current_user_role`/`profiles.role`, which is no longer true, and short-circuits the denied-path assertions — delete it. The `/hq` manifest note (church-admin listed only because the fixture is a platform admin) is accurate and pragmatic; the better fix is S1's. `current_user_role()` is now dead code.

## 4. Surfaces

OK: 117/117, 15/15, 30/30.

## 5. Ranked

1. (Medium, verified) `/api/ai` isn't platform-gated.
2. (Medium, inferred) The trigger exempts pastor and ministry_leader on their own rows.
3. (Low, verified) Stale `KNOWN_BUGS["secretary /hq"]` masks denied assertions.
4. (Low, verified) Dead role branches in `app/hq/page.tsx`.
5. (Info, inferred) A future self-demote flow would trip the trigger via the snapshot sync.
