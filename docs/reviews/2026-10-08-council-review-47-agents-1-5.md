# Council Review 47: agent reports (G2.1 phone-first member pages)

This was a diff-scoped round on `feat/phone-first-member-g2-1` (`abffd6e`), compared with `main`. Five separate read-only agents each received their verbatim `improve-software.md` prompt plus a scope preamble. Their reports are condensed below. The synthesis checks every claim against source and lists the wrong ones.

## Agent 1: Data and API

Nothing under `supabase/` changed. `formatInstantParts` falls back safely and is tested.

**Verified:**
- `upcomingServing` comes from `events.starts_at`.
- Giving dates now match the church-local years on the statements.
- Schedule shifts keep wall-clock time.

**Findings:**
- **Medium:** the e2e shift at +30 days is coupled to the rotation stats. Move it to +60.
- **Low:** `.first()` on Confirm can pick another spec's shift.
- **Low:** the double-tap guard reads a stale `isPending`, and decline has no guard.

**Gaps:**
- Two serving lists, `event_rosters` vs `volunteer_shifts`.
- The seed has no shift for the demo member.
- Drift in the local branch of `respondToShiftAction`.

## Agent 2: Routes and pages

No 404s, stubs, orphaned handlers or broken links. Giving has no current bottom-nav item, as intended.

**Gap:** three modals and drawers (family edit, profile edit, recurring drawer) don't get `touch-44`, and the e2e test can't see them.

**Note:** the role-types manifest entry doesn't list the component test. Not a violation.

## Agent 3: UX and shell

**F1 (Medium):** the same three dialogs are missing `touch-44`.

**F2 (Low):** member home loses the banner gap.

**F3 (Low):** new strings are English-only.

**F4 (Low):** `triggerProps` is untyped and overrides `onClick`.

**F5 (UNVERIFIED):** the first-screen test may pass only for a member with a complete profile.

**Checks that passed:** ARIA, CSS specificity and nav active states.

**Verdict:** ratify after F1 and F2.

## Agent 4: Feature and plan

The timezone, grid, labels and double-tap guard pass. The i18n items are minor. It found `triggerProps` untyped.

**Readiness:** 92, rising to 93 on merge. Recommends ratifying.

**Wrong:**
- It said O13 is open.
- It listed "T3".
- It scored a non-existent Teacher role.

## Agent 5: Security

No Critical, High or Medium findings; the branch changes presentation only.

**Low:**
- `triggerProps` spread order.
- Pre-existing: a member can replay their own shift answer.
- The e2e direct-database helpers don't refuse a non-local database.
