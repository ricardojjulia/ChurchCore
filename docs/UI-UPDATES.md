# UI Updates

This document records active UI direction changes for ChurchCore Ops.

## 2026-04-11: Blue-Neutral Minimal System

ChurchCore Ops is moving to a minimalist, high-contrast, adaptive UI system built for operational clarity rather than trend-driven decoration.

### Approved Direction

- Use a blue-neutral palette as the default visual system.
- Keep interfaces light-first for now.
- Prefer fewer surfaces with stronger hierarchy over dense card grids.
- Show detail only when it is needed.
- Keep mobile hit areas large and layouts responsive across phone, tablet, and desktop.

### Color Strategy

ChurchCore Ops now follows a practical version of the `60-30-10` rule:

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
