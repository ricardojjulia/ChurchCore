# Council Review 21 — Agent 4: Feature & Competitive Audit

**Branch:** `fix/session-church-profile-id`, commit `14461db` (S7).

**Root cause [V]:** since `20260420000000`, `handle_new_user()` gives every new auth user `profiles.id = gen_random_uuid()`, and `provision-tenant.mjs` does the same. So every real user created since April 20 was affected, not just seed data.

## Impact by module (before S7 → after)
- **Volunteer, member side:**
  - My Schedule was always empty;
  - in-app respond matched 0 rows and reported success;
  - signed-in blockouts failed.

  All fixed.
- **Admin create flows** (service plans, songs, reminders, hours, communication templates and suppressions, communication logs, finance journals and budgets, GL posting, group meetings and attendance, operations documents and onboarding, shepherd workflows): all violated `profiles` foreign keys. Fixed.
- **Pastoral and elders AI:** the `ai_interactions` audit insert failed, so there was no AI audit trail. Fixed.
- **Data rights:** requests updated 0 rows. Fixed. The export's `church_memberships.profile_id` filter targets a column that doesn't exist.
- **Still broken:**
  - member giving (`donations` insert is management-only; a Stripe PaymentIntent is created before the failing insert);
  - mobile check-in (no member `attendance` insert);
  - group join (no member `group_members` insert);
  - registration capacity and payments (an RLS-filtered count, and an admin-only payments upsert);
  - erasure (see Agent 1).

## Past scores
Reviews 9–20 counted these modules as working, but the e2e sweep only rendered pages; it never exercised writes as a non-platform user. The re-based Review 20 figure is about **64/100**: Volunteer Scheduling about 70%, Giving about 45%, member-portal writes about 40%.

## Tracker recommendations
- **S8 (Must, Week 1, before G1.5 and G3.1):** audit every member-reachable write against RLS, fix each one, and add member-JWT DB tests.
- **S9:** rename `profile.id`, lint against it, align the two id resolvers, and require 0-row checks.
- G3.1 depends on S8.
- T3 gains a "non-platform user creates through the UI" lens.

## MVP readiness after S7
**67/100**: 64 re-based, plus about 3 for the restored create flows and member self-service. Returning to 71 or more needs S8.
