# ADR 0007: Calendar View Overhaul

- Status: Accepted
- Date: 2026-06-07
- Deciders: Ricardo Julia

## Context

The calendar page used fixed-aspect-ratio month cells (aspect-ratio 1:1), a broken
week view CSS grid where all hour labels stacked in a single row due to missing
gridRow assignments, no period label in the navigation header, and category filter
state that reset on every view-mode change. The page did not meet the "enterprise
operations software" standard expected for demos and production use.

## Decision

Rewrite the two calendar components (CalendarHub and CalendarLiveBoard) using only
existing Mantine 9 primitives and Intl.DateTimeFormat. No new npm dependency is
introduced. FullCalendar remains a Sprint 3 consideration per DEVELOPMENT_PLAN.md.

Key decisions:
- State for activeCategory and viewMode lifted to CalendarHub so filter persists across view switches.
- Week view grid rebuilt with explicit gridTemplateRows and correct gridRow/gridColumn on every cell.
- getChurchHour/getChurchMinute helpers use Intl.DateTimeFormat with churchTimeZone instead of Date.getHours() (fixes silent timezone bug).
- Category helpers extracted to lib/calendar-utils.ts to avoid duplication.
- Mobile month view: 7-column grid replaced by grouped agenda list at ≤640px.
- Mobile week view: 7-day grid replaced by 3-day rolling window at ≤640px.

## Consequences

- CalendarHub is now a stateful client component.
- CalendarLiveBoard receives viewMode and onViewModeChange as props instead of owning them.
- The standalone Categories Paper section below the calendar is removed (replaced by Category Breakdown tile).
- Agenda snapshot footer inside CalendarLiveBoard is removed (views themselves replace it).
- CHANGELOG.md must be bumped.
