# Pastoral Care Foundation

This document describes the first real pastoral-care workflow slice added to the tenant app.

## Purpose

The pastor people route now moves beyond simple directory visibility and supports confidential pastoral work:

- pastoral notes
- care assignments
- status updates for active follow-up

This is intentionally a small foundation. It gives pastors a real workflow without pretending that elder collaboration, encryption policy, or broader care governance are already complete.

## Data Model

The tenant schema now includes:

- `pastoral_notes`
- `care_assignments`
- `can_access_pastoral_data(uuid)` helper for pastor-only access checks

These records are church-scoped and protected by RLS.

## Access Rules

- Only pastors and platform admins can read or write `pastoral_notes`
- Only pastors and platform admins can read or write `care_assignments`
- Church admins do not receive access to this data in this slice

This is stricter than ordinary church-admin visibility by design.

## Current Route

- `/app/pastor/people`

Current capabilities on that route:

- search and status filtering
- open a care modal per person
- create pastoral notes
- create care assignments
- update assignment status to open, in progress, or closed

## Current Constraints

- No delete flow yet for notes or assignments
- No field-level encryption yet
- No elder-shared discernment model yet
- No assignment routing to multiple pastors yet
- No notifications or reminders yet

## Why This Shape

ChurchForge needs a real pastoral-care primitive before it can credibly support elder workflows, AI guardrails, or richer discernment rooms. This slice establishes that primitive while keeping the blast radius small and reviewable.
