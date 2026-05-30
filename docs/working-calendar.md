# Working Calendar

This document describes the initial protected working calendar module in ChurchCore.

## Purpose

The working calendar is a central operating surface defined by `DEVELOPMENT_PLAN.md`. The current module now reads upcoming categorized events from Supabase when configured locally, while keeping the UI intentionally simple.

Its presentation is intentionally lighter and more compact so schedule work stays readable and operational instead of feeling like a dense dashboard.

## Current Route

- `/app/calendar`

Compatibility redirect:

- `/calendar`

## What The Module Includes

- A Mantine-based custom calendar component inside the church app
- Full Month, Week, and Day calendar views with smooth navigation
  - **Month View**: 7-column grid showing all days with event badges and category colors
  - **Week View**: Hourly time slots (6am–10pm) for the entire week
  - **Day View**: Agenda-style listing of all events for the selected day
- Live Supabase reads from categorized `events` rows when environment values are configured
- Category filtering and "All" option; filters apply across all calendar views
- Event-kind color coding by category (worship, prayer, administrative, ministry, etc.)
- Quick-add inline form for creating new events (management roles only)
- Detail drawer for event viewing with full descriptions, location, and action buttons
- Day-detail drawer behavior when users click a calendar day or week slot
- Event create, update, and delete mutations for church management roles (church-admin, pastor, ministry-leader)
- RSVP mutation flows (yes/no/maybe) for church users on RSVP-enabled events
- Approval queue visibility derived from non-approved event rows
- Local direct-Postgres fallback when local Supabase REST metadata is unavailable
- Timezone-aware event display using church timezone setting
- Broader calendar query window so month, week, day, and agenda views are less likely to look artificially incomplete
- Linked ChurchAdmin event-registration operations for capacity/waitlist/approval and custom event intake fields through `/app/church-admin/events/[id]`
- Linked volunteer service-plan execution with run-of-service blocks, optional church-event linkage, serving assignments, assignment response tracking, reminder audit logging for pending responses, linked event roster/check-in actions, coverage/response gap indicators, and direct linked navigation to event roster, attendance, and registrations through `/app/church-admin/volunteers/schedules` and `/app/church-admin/volunteers/schedules/[id]`

## What Is Still Missing

- Volunteer assignment workflows
- Resource booking enforcement
- Realtime synchronization
- iCal import and export

## Design Constraint

This route is protected by Supabase SSR auth when configured, with preview auth available only as a local fallback. It is part of the tenant-facing church app, not the platform control plane. Event reads are now live against Supabase, and the current implementation includes create, update, delete, RSVP, day-detail inspection, and agenda interactions. Realtime behavior, deeper scheduling workflows, and resource-aware planning still need to be built.
