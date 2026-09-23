# Council Review 15 — Agent 4: Feature & Competitive Audit

**Branch:** `feat/service-planning-role-taxonomy` (commit `4e081a9`)
**Baseline:** MVP 66–67/100 (Council Review 14, Story 1 alone)

## 1. Workflow Completion

Volunteer Scheduling advances further: Story 1 (~60% of gap #1) + Story 2's role taxonomy, team roster, and skill-based ranking (~12-15% incremental). Stories 3–5 (rotation planner, rehearsal scheduling, `event_id`-required schema change) remain not started. No other module changes.

## 2. User Role Coverage — verified against source

`canManageServicePlans()` gates all service-plan and role-type write operations identically (church-admin/pastor/ministry-leader); read-only for everyone else. Tenant-isolation fix in `addPlanPositionAction` confirmed real (see Agent 1's report) — no cross-tenant write path exists after this branch.

## 3. Core Operations Workflows

No change to child check-in, GL, comms dispatch, or impersonation gates. Audit logging correctly wired for role-type create/deactivate (not routine edits, matching Story 1's established asymmetry).

## 4. Competitive Gap Assessment — corrected

This report's first-pass draft claimed skill-based volunteer *ranking* was "❌ explicitly deferred to Story 3," conflating it with the genuinely-deferred rotation *planner* (Story 3, which wires the existing `burnout_calculator.ts` for auto-suggesting the next volunteer by fatigue/rotation history — a different feature). **That claim was checked directly against source and is wrong; corrected here.** `components/application/volunteer-schedule.tsx` contains a working `countMatchedSkills()` function, a sort comparator using matched-skill counts, and a rendered `"{matchedSkillCount}/{requiredSkills.length} skills"` badge in the assignment modal (lines 166-169, 779-780, 2202-2211) — skill-based ranking is built and tested in *this* branch, not deferred. What Story 3 actually defers is the rotation/auto-assignment *planner* logic (burnout-weighted suggestions), which is a distinct capability from the skill-match ranking already shipped here.

With that correction: Stories 1+2 combined close an estimated **~75% of gap #1** ("service planning depth" — setlist builder, song library, volunteer-role matching). The literal "volunteer-role matching" language from the original gap description is now substantively addressed — role taxonomy replaces free text, and the assignment pool actually ranks by skill match, not just displays skills as inert badges. What remains (Stories 3–5): rotation/auto-assignment logic, rehearsal scheduling, and the `event_id`-required schema precondition.

## 5. MVP Readiness Score

**67–69/100** (Agent 4's estimate, up from 66–67/100 after Story 1) — incremental, real progress on one module, not a phase-gate change. Phase A remains GO; Phases B–D remain NO-GO pending Stories 3–5 plus the other four ranked competitive gaps (mobile UX, recurring giving, migration tooling, provider breadth) and Phase D's binding external-validation blocker.

## Summary

High-quality infrastructure and UX layer for volunteer-role matching, more substantive than this report's own first-pass characterization suggested — the skill-ranking capability is real and shipped, not a stub. No blockers. Recommend merge and proceed to Story 3 (rotation planner).
