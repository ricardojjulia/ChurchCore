# Council Review 28 — Agents 1–4 (combined): Database & API, Routes, UX, Feature

**Scope:** `fix/comm-log-access-s1`, commit `3a704f4` vs `main` (S1). One combined read-only agent (the reduced format adopted after Review 25). No repo writes; probes ran as `BEGIN … ROLLBACK` against local Supabase.

## 1. Communication tables vs page gates

- All 8 `/app/communications/*` pages, `commRoleAllowed` (`app/app/communications-actions.ts`), and the retry and delivery-events gates admit pastor, church-admin and secretary. The `communication_logs` policies now match. Probe: nora (church admin) 5 rows, olivia (secretary) 5, robert (ministry leader) 0.
- No reader lost data it should have:
  - The readiness and operations loaders are church-admin only.
  - The Shepherd AI read runs only from admin-client jobs.
  - Compose writes through the admin client.
- **Still on `can_manage_church`, so not aligned:**
  - `communication_delivery_events`: select and insert.
  - `communication_suppressions`: select and insert.
- `communication_templates` and `communication_dlq` already use `can_manage_communications`.

## 2. The nora fixture

- The seed is correct and idempotent: one profile, one active `church_admin` membership, no `platform_admins` row.
- CI receives `CHURCHCORE_OPS_DEMO_CHURCH_ADMIN_EMAIL`. The path is `setup-e2e.sh` → `create-dev-users.sh` → `.demo-credentials.local` → `fixtures/env.ts`.
- **Stale:** three comments and one describe title still name sarah as the church admin.
- **Stale:** the sweep still skips church-admin on control-plane pages. Nora is not a platform admin, so that denial can now be asserted.

## 3. `/hq` and the sweep

- `test:surfaces` passes: 117 pages, 15 routes, 30 actions.
- The sweep treats `allowedRoles: []` as denying every church identity.
- **Gap (inferred):** the sweep never reads `platformAdminOnly`, so nothing in e2e shows a platform admin rendering `/hq`. That case is covered by the layout unit test only.

## 4. What the platform-admin bypass was hiding

Row counts per RLS table, nora vs sarah, differ only on:
- `audit_log` (platform rows);
- `hq_*`;
- `platform_admins`;
- **`care_assignments`: nora 0, sarah 4.**

`can_access_pastoral_data` admits pastors only. The church-admin dashboard care queue and drawer, and the daily desk's care count, are therefore silently empty for a real church admin. That reads as "nothing to do", not "restricted".

## 5. Findings

1. **High (verified):** `cancelScheduledMessageAction` updates `communication_logs` with the user's own client. The table has no UPDATE policy, so the update matches 0 rows, the action returns `{ok:true}`, and the cron sends the "cancelled" message. This predates S1.
2. **Medium (verified):**
   - A secretary's message detail and analytics read `communication_delivery_events` and show zeros.
   - A ministry leader can read delivery events, including `recipient_contact`, through the API.
3. **Medium (verified):** a ministry leader can read 13 `communication_suppressions` rows (contact emails and phones) through the API, while a secretary sees 0.
4. **Medium (verified data, inferred UX):** for a real church admin, the dashboard care queue is silently empty.
5. **Low (verified):**
   - stale sarah comments and the leftover control-plane sweep skip;
   - the DB test checks reads only;
   - the validator's error text doesn't mention `platformAdminOnly`.

**Readiness:** holds at 74/100; fixing findings 1 and 2 before merge justifies about 75.
