# ChurchAdmin Workspace

This document describes the first role-specific deep workspace in ChurchForge.

## Purpose

The ChurchAdmin portal at `/app/church-admin` is the first workspace to move beyond the shared role shell into an operations-focused board.

The ChurchAdmin people-management route at `/app/church-admin/people` now extends that role with a tenant-backed records screen.

Sprint 2 extends the ChurchAdmin surface further with:

- `/app/church-admin/accounts` for public portal-request review and approval
- `/app/church-admin/events/[id]` for attendance and roster management on a single event

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
- A tenant-backed portal-request approval queue with member-number generation and invite dispatch when service-role env is configured
- An event-specific workspace for roster assignments, roster confirmations, member check-in, visitor quick-add, and seven-day burnout warnings
- Designated ministry-leader assignment in Ministry Forge settings, feeding pastor led-ministry visibility from tenant ministry records

## Why ChurchAdmin First

Church administration sits at the intersection of member care, scheduling, giving, communications, and volunteer execution. That makes it the best first portal to deepen before the Supabase-backed data layer is fully connected.

## Current Constraint

The operations lanes under `/app/church-admin` are still preview-backed. The `/app/church-admin/people`, `/app/church-admin/accounts`, and `/app/church-admin/events/[id]` routes now use real tenant data, but CSV import, automated host-based tenant routing, and richer communications workflows still need to be added.

## Sprint 2 Notes

Sprint 2 makes ChurchAdmin the bridge between three previously disconnected product areas:

- church people records
- weekend / event execution
- member portal identity approval

That bridge matters operationally. A church-admin can now:

- receive a public request from a prospective portal user
- connect that request to an existing or new church profile
- approve the request and issue a church-safe member identity
- manage the same member again later in event attendance and roster workflows

This is the first point where ChurchForge starts to feel like one connected tenant app instead of several isolated role demos.
