# Working Calendar

This document describes the initial protected working calendar module in ChurchForge.

## Purpose

The working calendar is a central operating surface defined by `DEVELOPMENT_PLAN.md`. The current module now reads upcoming categorized events from Supabase when configured locally, while keeping the UI intentionally simple.

Its presentation is intentionally lighter and more compact so schedule work stays readable and operational instead of feeling like a dense dashboard.

## Current Route

- `/app/calendar`

Compatibility redirect:

- `/calendar`

## What The Module Includes

- A simpler Mantine-based calendar shell inside the church app
- Live Supabase reads from categorized `events` rows when environment values are configured
- Category filtering over upcoming events
- A detail drawer for the selected event
- Approval queue visibility derived from non-approved event rows
- Local direct-Postgres fallback when local Supabase REST metadata is unavailable

## What Is Still Missing

- Event CRUD flows
- RSVP mutation flows
- Volunteer assignment workflows
- Resource booking enforcement
- Realtime synchronization
- iCal import and export

## Design Constraint

This route is protected by Supabase SSR auth when configured, with preview auth available only as a local fallback. It is part of the tenant-facing church app, not the platform control plane. Event reads are now live against Supabase, but event creation, mutation, scheduling workflows, and realtime behavior still need to be built.
