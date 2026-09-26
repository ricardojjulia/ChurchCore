---
name: gemini-test-council
description: Summon the AI Council of Testers (v5.0) — Persona-based E2E journey testing (Pastor, Secretary, Volunteer, Visitor), multi-tenant RLS auditing, Realtime sync checks, Core Web Vitals, and patch-ready defect triage.
---

# 🏛️ ChurchCore AI Council of Testers (v5.0)

Summon this skill to autonomously execute multi-persona E2E tests, audit security invariants, verify Supabase Realtime synchronization, and produce patch-ready defect reports for ChurchCore.

## 👥 The 4 Test Personas

1. **Pastor (`church_admin` / `lead_pastor`)**
   - Viewport: Desktop (1440x900)
   - Scope: Sermon planning, giving/tithe rollups, confidential pastoral counseling records.
   - SLA & Invariant: LCP < 1.8s; Table aggregates match KPI cards 100%; Cross-tenant RLS isolation strictly verified.

2. **Secretary (`church_staff` / `volunteer_coord`)**
   - Viewport: Desktop (1440x900)
   - Scope: Bulk scheduling, room conflict resolution, roster check-in updates, member CSV export.
   - SLA & Invariant: INP < 200ms; Rapid concurrent inputs must not double-submit; Negative financial boundary (`/giving/reports` -> 403 Forbidden).

3. **Volunteer (`volunteer_leader` / `ministry_lead`)**
   - Viewport: Tablet (768x1024)
   - Scope: Service cue sheets, volunteer check-in, small group rosters.
   - SLA & Invariant: Real-time schedule sync via Supabase Realtime; Negative admin boundary (no billing/staff/pastoral notes access).

4. **New Visitor (`anonymous_visitor` / `new_member`)**
   - Viewport: Mobile (375x812, 3G Throttled)
   - Scope: Connection cards, event/retreat registration, family profile & child check-in.
   - SLA & Invariant: CLS < 0.05; Minimum tap targets >= 48px; Negative app boundary (`/app/*` -> redirects to `/login`).

---

## 🔄 Execution Workflow

1. **Fixture Setup:**
   - Spin up/target an isolated test tenant (`tenant_test_[uuid]`).
   - Use dynamic relative dates (`getNextSunday()`, `now() + 7 days`).

2. **Integration Mocking:**
   - Route Stripe payments through Test Mode tokens (`pm_card_visa`).
   - Sink transactional email/SMS (Resend/Twilio) to in-memory buffers.

3. **Autonomous Journey Execution:**
   - Execute test turns using the 4-tier self-healing hierarchy:
     1. Semantic Locators (`role`, `aria-label`, `data-testid`)
     2. A11y Tree + Relative Spatial Anchor
     3. Visual Normalized Bounding Box (`[ymin, xmin, ymax, xmax]`)
     4. Self-Healing Selector update

4. **Security & Concurrency Invariant Auditing:**
   - Verify multi-tenant RLS isolation (0 rows leaked across tenants).
   - Test optimistic locking on concurrent bookings (1 succeeds with 200, 1 receives 409 Conflict).
   - Verify Supabase Realtime broadcast across concurrent sessions.

5. **Council Report Generation:**
   - Check alignment with `tests/coverage-manifest.json`.
   - Output structured report with patch-ready diffs to `docs/reviews/council-test-YYYYMMDD-HHMM.md`.
