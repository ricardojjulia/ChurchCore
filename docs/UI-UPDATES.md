# UI Updates

This document records active UI direction changes for ChurchCore.

## 2026-04-11: Blue-Neutral Minimal System

ChurchCore is moving to a minimalist, high-contrast, adaptive UI system built for operational clarity rather than trend-driven decoration.

### Approved Direction

- Use a blue-neutral palette as the default visual system.
- Keep interfaces light-first for now.
- Prefer fewer surfaces with stronger hierarchy over dense card grids.
- Show detail only when it is needed.
- Keep mobile hit areas large and layouts responsive across phone, tablet, and desktop.

### Color Strategy

ChurchCore now follows a practical version of the `60-30-10` rule:

- `60%` neutral backgrounds and surfaces
- `30%` slate structure, text hierarchy, and framing
- `10%` blue accent for actions, active states, and trust cues

Core palette:

- Background: `#F6F7F9`
- Surface: `#FFFFFF`
- Border: `#D9E0E7`
- Primary text: `#14213D`
- Secondary text: `#5C6B7A`
- Primary action: `#2563EB`
- Primary hover: `#1D4ED8`
- Success: `#0F766E`
- Warning: `#B45309`
- Danger: `#B91C1C`

### Component Guidance

- Default to Mantine components and theme tokens.
- Prefer lists, queues, and tables over decorative card mosaics.
- Use badges to classify state, not to decorate.
- Use drawers and progressive disclosure instead of loading every detail into the main surface.
- Keep page copy short and task-oriented.

### Explicitly Avoid

- Glassmorphism as a default system
- Neumorphism
- Neon or dopamine-heavy palettes for core admin screens
- Bento-style box grids when a list or table communicates better
- Marketing copy inside operational workflows

### Dark Mode Status

Dark mode is deferred for now.

Reason:

- The higher-priority problem is structural clarity, not theme count.
- Dark mode should be added only after the token system is stable across control-plane and church-app surfaces.
- When added, it must come from shared design tokens instead of one-off overrides.

### First Applied Surfaces

- Shared Mantine shell
- Session controls
- Landing page
- Control plane overview and tenant-view surface

### Follow-On Work

- Apply the same system to `/app/church-admin`
- Reduce remaining preview-era copy in role workspaces
- Add list or table views where queue-heavy content still reads like card clutter
- Introduce token-driven dark mode only after the light theme is complete

## 2026-05-22: Public Home Console Direction

The public home screen now uses a sharper ChurchCore command-center presentation instead of the earlier soft centered card. The visual direction should feel professional and technical while keeping faith references restrained and operational.

### Applied Direction

- Lead with ChurchCore as the first-viewport product signal.
- Use the landing screen to communicate an operations system for people, ministries, events, care, giving, volunteers, and calendar coordination.
- Prefer crisp panels, status lanes, and metric signals over decorative illustrations.
- Keep faith language concrete and light: stewardship, prayer, worship, mission, care.
- Preserve language, sign-in, control-plane, and public portal entry points.

## 2026-05-22: ChurchAdmin Shell Emphasis

The signed-in ChurchAdmin workspace now uses a stronger visual hierarchy to guide operators through the product.

### Applied Direction

- Use a dark, high-contrast navigation rail so the menu feels deliberate and app-like.
- Use teal, gold, blue, and violet accents to separate people, ministry, events, and giving signals.
- Make active navigation unmistakable with a colored rail, stronger contrast, and compact descriptions.
- Give the dashboard summary a command-center lead panel instead of a flat card stack.
- Keep operational detail cards quiet, but make their containing sections cleaner and easier to scan.
