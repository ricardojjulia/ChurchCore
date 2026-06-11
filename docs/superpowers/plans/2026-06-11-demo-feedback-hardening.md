# Demo Feedback Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make demo feedback identity, fingerprints, timing, validation, and rate limiting server-authoritative, and provide a reusable AI replication prompt.

**Architecture:** The Next.js route validates browser context, derives authenticated identity with `getSession`, computes a normalized SHA-256 fingerprint, and calls one control-plane Postgres RPC. The RPC atomically enforces a per-session rate window and upserts feedback while preserving the existing control-plane and RLS boundaries.

**Tech Stack:** Next.js App Router, TypeScript, React 19, Mantine, Supabase/Postgres, Vitest

---

### Task 1: Shared feedback normalization and fingerprinting

**Files:**
- Create: `lib/demo/feedback.ts`
- Create: `lib/demo/feedback.test.ts`

- [ ] Add tests proving whitespace/case normalization and distinct manual-note fingerprints.
- [ ] Run `npm test -- lib/demo/feedback.test.ts` and confirm the tests fail because the module is missing.
- [ ] Implement allowed categories, bounded payload parsing, text normalization, and Node SHA-256 fingerprint generation.
- [ ] Re-run `npm test -- lib/demo/feedback.test.ts` and confirm all tests pass.

### Task 2: Server-authoritative API behavior

**Files:**
- Modify: `app/api/demo/feedback/route.ts`
- Modify: `app/api/demo/feedback/route.test.ts`

- [ ] Add route tests for server-derived identity, anonymous identity, ignored client identity/fingerprint, session duration, strict field bounds, and RPC rate-limit rejection.
- [ ] Run `npm test -- app/api/demo/feedback/route.test.ts` and confirm the new tests fail for the intended missing behavior.
- [ ] Replace the module-local limiter with `getSession`, shared parsing/fingerprinting, and the `submit_demo_feedback` RPC.
- [ ] Re-run `npm test -- app/api/demo/feedback/route.test.ts` and confirm all route tests pass.

### Task 3: Client capture context

**Files:**
- Modify: `components/demo/feedback-button.tsx`
- Modify: `components/demo/feedback-button.test.tsx`
- Modify: `components/demo/demo-error-boundary.tsx`
- Modify: `components/demo/demo-error-boundary.test.tsx`

- [ ] Update tests to require session duration from both capture paths and prohibit browser identity/fingerprint fields.
- [ ] Run the two component test files and confirm the new assertions fail.
- [ ] Remove browser fingerprint computation and add duration to automatic error capture.
- [ ] Re-run the component tests and confirm they pass.

### Task 4: Atomic control-plane persistence

**Files:**
- Create: `supabase/control-plane/migrations/20260611120000_demo_feedback_hardening.sql`

- [ ] Add `session_duration_seconds` with a non-negative constraint.
- [ ] Add the private `demo_feedback_rate_limits` table with RLS enabled and no browser policies.
- [ ] Add `submit_demo_feedback(...) returns boolean` using an advisory transaction lock, a 60-second window, a maximum of 20 accepted requests, opportunistic stale-row cleanup, and fingerprint-based feedback upsert.
- [ ] Revoke public/authenticated execution and grant function execution to `service_role`.

### Task 5: Review workspace visibility

**Files:**
- Modify: `lib/control-plane-demo-feedback.ts`
- Modify: `components/application/demo-feedback-workspace.tsx`
- Modify: `components/application/demo-feedback-workspace.test.tsx`

- [ ] Add a failing workspace test for displayed session duration.
- [ ] Add the nullable duration field to the row type and display it in the drawer.
- [ ] Run the workspace and data-loader tests and confirm they pass.

### Task 6: Replication prompt and operational documentation

**Files:**
- Create: `docs/prompts/replicate-demo-feedback-system.md`
- Create: `docs/factory-runs/2026-06-11-demo-feedback-hardening.md`
- Modify: `docs/factory-runs/README.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] Write a stack-adaptable prompt covering discovery, architecture, schema, API, capture UI, automatic errors, review UI, security, tests, migrations, docs, and verification.
- [ ] Document intent, acceptance criteria, architecture impact, sensitive-data treatment, verification evidence, residual risk, and delivery status.
- [ ] Update README and CHANGELOG with the hardened behavior.

### Task 7: Verification and review

**Files:**
- Review all changed files

- [ ] Run focused feedback tests.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Review the final diff for tenant/control-plane separation, service-role exposure, PII minimization, migration safety, and unrelated changes.
- [ ] Record exact results in the factory-run document.
