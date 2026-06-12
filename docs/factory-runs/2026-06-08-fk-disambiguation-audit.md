# FK Disambiguation Audit — PGRST201 Prevention
**Date**: 2026-06-08 (updated 2026-06-08)
**Scope**: 16 tables with multiple FK columns pointing to `profiles`
**Risk**: Any unqualified `profiles(...)` or reverse `<table>(...)` join in a Supabase `.select()` against a table with more than one FK to `profiles` will trigger PGRST201 (ambiguous FK join) at runtime.
**Reference pattern (already fixed)**: `lib/church-admin-accounts-data.ts` — `profiles!account_requests_profile_id_fkey(full_name, member_number, account_status)`

---

## Tables Audited

### Tables with active broken queries — FIXED

| Table | Migration | FK columns to `profiles` | Broken query location | Fix applied |
|---|---|---|---|---|
| `kingdom_impacts` | `20260414000000_ministry_forge_phase2.sql` | `profile_id`, `created_by` | `lib/ministry-forge-data.ts:506` | `profiles!kingdom_impacts_created_by_fkey(full_name)` |
| `volunteer_match_suggestions` | `20260415000000_ministry_forge_phase3.sql` | `profile_id`, `reviewed_by` | `lib/ministry-forge-data.ts:864` | `profiles!volunteer_match_suggestions_profile_id_fkey(full_name, spiritual_gifts, current_ministry_load)` |
| `volunteer_hours_log` | `20260504000000_volunteer_scheduling.sql` | `profile_id`, `logged_by` | `lib/volunteer-data.ts:472` (reverse join from `profiles`) | `volunteer_hours_log!volunteer_hours_log_profile_id_fkey(hours, service_date)` |

**Note on `communication_logs`**: already uses column-name FK hints (`profiles!sent_by(...)` and `profiles!recipient_id(...)`) in `lib/communications-data.ts:240`, which PostgREST accepts. No change needed.

**Note on `mentorship_pairs`, `support_pairings`, `mentor_couples`, `young_adult_career_mentorships`**: already use FK-qualified syntax in `lib/ministry-forge-data.ts`. No change needed.

---

### Investigated joins that are safe (single FK to `profiles` — no fix needed)

The following unqualified `profiles(...)` queries were audited and confirmed safe because their source table has only ONE FK to `profiles`. PostgREST can resolve these unambiguously.

| Query location | Table queried | FK columns to `profiles` | Verdict |
|---|---|---|---|
| `lib/groups-data.ts:308` | `group_members` | `profile_id` only | Safe |
| `lib/groups-data.ts:319` | `group_resources` | `added_by` only | Safe |
| `lib/volunteer-data.ts:267` | `volunteer_shifts` | `assigned_user_id` only | Safe |
| `lib/volunteer-data.ts:408` | `church_memberships` | `user_id` only | Safe |
| `lib/ministry-forge-data.ts:1122` | `discipleship_groups` | `leader_id` only | Safe |
| `lib/ministry-forge-data.ts:1213` | `life_stage_circles` | `leader_id` only | Safe |
| `lib/ministry-forge-data.ts:1633` | `youth_graduation_tracking` | `profile_id` only | Safe |
| `lib/ministry-forge-data.ts:1819` | `education_enrollments` | `profile_id` only | Safe |
| `lib/ccm-data.ts:414` | `ccm_volunteer_assignments` | `profile_id` only | Safe |
| `lib/ccm-data.ts:565` | `ccm_volunteer_assignments` | `profile_id` only | Safe |
| `lib/elders-data.ts:347` | `discernment_sessions` | `created_by` only | Safe |
| `app/app/actions.ts:2763` | `profile_ministries` | `profile_id` only | Safe |

---

### Tables with no current `profiles(...)` queries — RISK DOCUMENTED

Future developers writing `.select()` calls on these tables MUST use an FK-qualified join hint. The constraint name follows the PostgreSQL default pattern `<table>_<col>_fkey`.

| Table | Migration | FK columns to `profiles` | FK constraint names to use |
|---|---|---|---|
| `care_assignments` | `20260412140000_pastoral_care_foundation.sql` | `profile_id`, `created_by`, `assigned_to` | `care_assignments_profile_id_fkey`, `care_assignments_created_by_fkey`, `care_assignments_assigned_to_fkey` |
| `council_notes` | `20260416000000_elders_pastor_council_phase4.sql` | `created_by`, `last_edited_by` | `council_notes_created_by_fkey`, `council_notes_last_edited_by_fkey` |
| `daily_work_items` | `20260509000000_daily_desk.sql` | `related_profile_id`, `assigned_to_profile_id`, `created_by` | `daily_work_items_related_profile_id_fkey`, `daily_work_items_assigned_to_profile_id_fkey`, `daily_work_items_created_by_fkey` |
| `elder_notes` | `20260416000000_elders_pastor_council_phase4.sql` | `profile_id`, `created_by` | `elder_notes_profile_id_fkey`, `elder_notes_created_by_fkey` |
| `finance_journals` | `20260417000000_financial_management.sql` | `posted_by`, `created_by` | `finance_journals_posted_by_fkey`, `finance_journals_created_by_fkey` |
| `member_change_requests` | `20260527234500_member_change_requests_pending_review.sql` | `target_profile_id`, `requested_by_profile_id`, `reviewer_profile_id` | `member_change_requests_target_profile_id_fkey`, `member_change_requests_requested_by_profile_id_fkey`, `member_change_requests_reviewer_profile_id_fkey` |
| `mentor_couples` | `20260421000000_ministry_tracks_phase4.sql` | `partner1_id`, `partner2_id` | `mentor_couples_partner1_id_fkey`, `mentor_couples_partner2_id_fkey` |
| `mentorship_pairs` | `20260421000000_ministry_tracks_phase4.sql` | `mentor_id`, `mentee_id` | `mentorship_pairs_mentor_id_fkey`, `mentorship_pairs_mentee_id_fkey` |
| `pastoral_notes` | `20260412140000_pastoral_care_foundation.sql` | `profile_id`, `created_by` | `pastoral_notes_profile_id_fkey`, `pastoral_notes_created_by_fkey` |
| `support_pairings` | `20260421000000_ministry_tracks_phase4.sql` | `supporter_id`, `supported_id` | `support_pairings_supporter_id_fkey`, `support_pairings_supported_id_fkey` |
| `workflows` | `20260505000000_shepherd_ai_ops_foundation.sql` | `owner_user_id`, `assigned_to_user_id` | `workflows_owner_user_id_fkey`, `workflows_assigned_to_user_id_fkey` |
| `young_adult_career_mentorships` | `20260430000000_advanced_ministry_forge.sql` | `mentor_id`, `mentee_id` | `young_adult_career_mentorships_mentor_id_fkey`, `young_adult_career_mentorships_mentee_id_fkey` |

---

## Fix Pattern

```typescript
// WRONG — triggers PGRST201 when table has more than one FK to profiles:
.select("id, profile_id, profiles(full_name)")

// CORRECT — disambiguate using the FK constraint name:
.select("id, profile_id, profiles!kingdom_impacts_created_by_fkey(full_name)")

// ALSO CORRECT — column name hint (shorter, also accepted by PostgREST):
.select("id, sent_by, profiles!sent_by(full_name)")

// REVERSE JOIN from profiles to a multi-FK table — also needs qualification:
// WRONG:
.from("profiles").select("id, volunteer_hours_log(hours)")
// CORRECT:
.from("profiles").select("id, volunteer_hours_log!volunteer_hours_log_profile_id_fkey(hours)")
```

The FK constraint name defaults to `<table>_<column>_fkey` when PostgreSQL auto-generates it (no explicit `constraint` clause in the migration DDL). All migrations listed above use inline `references public.profiles(id)` without named constraints, so the auto-generated names apply.

---

## Verification (2026-06-08 update)

- `npm run test` — passed
- `npm run build` — passed
- `npm run lint` — passed (pre-existing warnings not introduced by this change)

---

## Residual Risk

- No integration test currently runs against a live Supabase project, so PGRST201 would only surface at runtime. The 12 tables listed as "no current queries" remain latent risks until query coverage is added.
- When writing new queries against any of the 12 tables above, always use the FK-qualified form documented in this table.
- **Reverse joins are also subject to PGRST201**: when selecting FROM `profiles` and embedding a multi-FK table, use `<table>!<table>_<fk_col>_fkey(...)` syntax.
- If a future migration renames a FK column or adds an explicit constraint name, update the hint accordingly.
