# ChurchAdmin Workspace

This document describes the first role-specific deep workspace in ChurchForge.

## Purpose

The ChurchAdmin portal at `/app/church-admin` is the first workspace to move beyond the shared role shell into an operations-focused board.

The ChurchAdmin people-management route at `/app/church-admin/people` now extends that role with a tenant-backed records screen.

## What It Includes

- A Mantine-based operations view within the shared app shell
- Segmented operational lanes for care, weekend, communications, and giving
- Care and follow-up queue visibility with assignment and contact mutation flows
- Weekend readiness tasks with local status advancement
- Communications queue summaries with draft-to-ready-to-scheduled transitions
- Giving and reconciliation cards with local review and reconciled states
- A slide-over detail drawer for the active ChurchAdmin work item
- Preview persistence so workflow changes survive refresh and navigation
- A tenant-backed people-management route for churchgoer records and status updates

## Why ChurchAdmin First

Church administration sits at the intersection of member care, scheduling, giving, communications, and volunteer execution. That makes it the best first portal to deepen before the Supabase-backed data layer is fully connected.

## Current Constraint

The operations lanes under `/app/church-admin` are still preview-backed. The new `/app/church-admin/people` route uses real tenant data, but bulk tools, import flows, and richer workflow logic still need to be added.
