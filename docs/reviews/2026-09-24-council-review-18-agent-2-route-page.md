# Council Review 18 — Agent 2: Route & Page Audit

**Branch:** `feat/e2e-testing-foundation` (draft PR #150), diff-scoped. Gate lines were checked for all 117 pages, and ~35 were fully read, including every dynamic, `/control`, redirect, invalid-token and noted page. The only gating layout in the app is `app/hq/layout.tsx`.

## 1. Manifest accuracy
**No `allowedRoles` / `deniedRedirectsTo` / `controlPlane` disagreements with the code.** Notes and fields that are off:
- The `/app` note says super-admin goes to `/control`, but the sweep asserts `/sign-in`. That may be a local-only effect of both stacks sharing the default `@supabase/ssr` cookie name on 127.0.0.1.
- The `/hq` note says `/app/hq`.
- `finance/journals/[id]` redirects to `/journals` for a missing id rather than calling `notFound()`.
- Five redirect-only pages (`children`, `finance`, `ministry/overview`, `operations`, `/controll`) are labelled `public: true`. That is misleading but not a gap: their destinations are gated.

## 2. Sweep false greens
1. **`missingRecord` pages** (16) never assert that an allowed role stayed on the page. A gate that wrongly bounced pastor would pass.
2. **The church-admin identity is also a platform admin**, and `is_platform_admin()` short-circuits `can_manage_church`. Church-admin checks can therefore pass through an RLS bypass that a real church admin wouldn't get. It needs a pure church-admin fixture.
3. **`redirectsTo` is never asserted** for redirect-only public pages, and `/app`, `/calendar` and `/workspace` have none. An allowed identity landing on `/sign-in` would pass.
4. **`/app/[role]` cross-role denial** is never tested.
5. **Invalid-token pages** don't assert their graceful text.
6. **`KNOWN_BUGS` under `test.fail()`** stays green on any failure, including a new 5xx.
7. **`INLINE_DENIAL`** checks only for the "Access Denied" text, not that the page's data is absent.
8. **Signed-in visits to public pages are skipped** (`/portal` redirects, `/sign-in` `force=1`).
9. **`/control/[section]`** covers only `tenants`.

## 3. Access-control findings, verified
| Finding | Severity |
|---|---|
| **Secretary vs `communication_logs` RLS.** Page gates admit secretary, but `can_manage_church` excludes her: her history list renders empty and her inserts are blocked. **Inverse leak:** ministry-leader is denied by the UI, but RLS lets her read every church comm log directly. | **High** |
| **`/hq` uses `profiles.role`.** A real design flaw. Its stated cause needs correction: `seed.sql` sets Olivia to `secretary`, yet the local DB has `member_volunteer`, which is drift. Also, `hq_*` tables have no `church_id`, so all staff in a shared tenant DB read all HQ rows (pre-existing). | **Medium** |
| **`/app/member/groups`** has no role check. | **Low** |
| **Redirect-only pages** have no gate of their own. | Informational |
| **`/api/reports/custom`** swallows its redirect (500), and it uses `queryTenantLocalDb`, which bypasses RLS. | **Medium** |

## 4. API routes
All 15 are covered. Most important missing case: **`/api/reports/custom` role tests** (member/secretary → 403, pastor → CSV) on PII/donation exports. Also missing:
- control routes as a tenant role;
- demo `complete-payment`'s 403 outside demo mode;
- `/api/ai` role cases.
