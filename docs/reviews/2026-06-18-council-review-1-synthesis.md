# Council Review Synthesis: ChurchCore LMS — Sprint 1

**Date:** 2026-06-18
**Review ID:** Council Review 1
**Status:** Complete

---

## 1. Cross-Agent Consensus

The 4 council agents independently flagged the following architectural and UX gaps:
* **RPC Testing Gaps**: There are no dedicated unit/integration tests covering the Postgres helper function `public.current_user_role()`. Since RLS policies on all four HQ tables rely entirely on this helper, it is a high-risk security target.
* **Loader Blocking**: The auth session checks on `/hq` display a full-screen Mantine loader instead of rendering structural skeleton elements, creating visual friction during routing.
* **API Protection**: Secondary transactional POST handlers (e.g. unsubscribe endpoints) lack the rate-limiting guards implemented in key control-plane routes (such as feedback limits).

---

## 2. ADR Mapping

* **ADR 0010: Project HQ Governance Architecture, Role-Based RLS Helper, and PII-Scrubbed AI Proxy** has been drafted and accepted. It documents the RLS configuration, access control mapping rules, and PII protection bounds.
  * File: [0010-project-hq-governance-architecture.md](file:///Users/rjulia/ChurchCore/docs/adr/0010-project-hq-governance-architecture.md)

---

## 3. Implementation Prompts

### Prompt A — Role-Based RLS Helper Integration Tests

**ADR Reference:** ADR-0010
**Files:** `tests/database/current-user-role.test.ts`
**Scope:** Build a database-level test suite executing queries as mocked users to verify the output of `public.current_user_role()`.

**Work:**
1. Create a test database runner using `pg` client connectors.
2. Seed mock records: platform admins, church admins, pastoral staff, lead teachers, and standard volunteers.
3. Execute SQL sessions executing `SELECT public.current_user_role();` under the corresponding `auth.uid()` values.
4. Assert that the helper returns the correct output role (`'admin'`, `'manager'`, `'teacher'`, or `'member'`).

**Verification:**
* `npx vitest run tests/database/current-user-role.test.ts`
* `npm run lint`

---

### Prompt B — Rate Limiting on Public API Routes

**ADR Reference:** N/A
**Files:** `app/api/unsubscribe/route.ts`, `app/api/push/subscribe/route.ts`
**Scope:** Integrate rate-limiting guards to prevent route exhaustion or bot abuse.

**Work:**
1. Import rate limiter utility or implement transaction-based IP/session throttling.
2. Block requests exceeding 15 calls per minute, returning a `429 Too Many Requests` status.
3. Add corresponding regression tests.

**Verification:**
* `npm run test`
* `npm run build`

---

### Prompt C — Skeleton Loaders on Governance Page

**ADR Reference:** N/A
**Files:** `app/hq/page.tsx`
**Scope:** Replace full-screen loading spinners with Mantine Skeleton components during authentication checks.

**Work:**
1. Import `Skeleton` from `@mantine/core` in `app/hq/page.tsx`.
2. Replace `<Loader color="teal" />` within `sessionLoading` with visual structural placeholders for the dashboard cards, tables, and sidebar nav.
3. Confirm transitions behave smoothly on load.

**Verification:**
* `npm run lint`
* `npm run build`

---

## 4. Execution Order

1. **Prompt A** (High priority; verifies role auth logic correctness).
2. **Prompt B** (Medium priority; security hardening for endpoints).
3. **Prompt C** (Low priority; user interface polish).
