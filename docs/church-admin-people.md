# ChurchAdmin People

This document describes the first real people-management screen for ChurchAdmin.

## Route

- `/app/church-admin/people`

## Purpose

The existing ChurchAdmin workspace handles operational preview lanes, but it did not provide a tenant-backed people surface. This route fills that gap with a real church-scoped records screen.

## What It Includes

- Search across names, families, email, phone, and ministries
- Filters for membership status and church role
- Summary counts for total people, visitors, families, and incomplete profiles
- Bulk actions for membership status and privacy visibility across selected records
- Household reassignment for existing profiles
- Duplicate detection based on shared email or phone
- Duplicate merge action that keeps one canonical record and retires the source profile
- Edit flow for core profile fields:
  - name
  - phone
  - address
  - display title
  - membership status
  - preferred contact method
  - emergency contact
  - directory visibility
  - contact permission
- Offline member identity fields that now support downstream portal and attendance workflows:
  - `member_number`
  - `account_status`
  - `is_roster_eligible`

## Data Rules

- Reads and writes stay church-scoped through tenant `profiles` and `families`
- Merged profiles are retired with `merged_at` and hidden from member, pastor, and church-admin lists
- Duplicate merge updates downstream people records such as ministries, attendance, care assignments, and event RSVPs
- This route does not expose pastoral notes or pastoral care records
- Confidential pastoral workflows remain on the pastor side
- Portal-request review now happens on `/app/church-admin/accounts`, but the linked member records still resolve from the same tenant `profiles` table documented here
- Event attendance and rosters now resolve from `/app/church-admin/events/[id]`, and both workflows depend on the same church-scoped people records managed here

## Current Constraints

- No CSV import yet
- No auth-email change flow yet
- Staff records stay out of the duplicate-merge flow
- Public portal registration still requires church selection because automatic host-to-tenant routing is not yet implemented on `/portal/register`

## Why This Slice

Church administration needs a real people-management screen before the product can credibly support richer directory, follow-up, and reporting workflows. This route establishes that baseline without crossing into pastor-confidential data.
