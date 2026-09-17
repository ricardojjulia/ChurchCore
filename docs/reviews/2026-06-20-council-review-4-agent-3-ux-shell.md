# Council Agent 3: UX & Shell Audit — ChurchCore Operations

**Date:** 2026-06-20  
**Auditor:** Agent 3 — UX, Accessibility & Shells  
**Status:** Complete  

---

## 1. ARIA Correctness

We audited layout components for accessibility:
- **`components/application/app-shell.tsx`**:
  - Burger button contains `aria-label="Toggle navigation"`.
  - NavLinks and dynamic menu bars utilize clean semantic wrapping.
- **Form Controls**: Checkboxes inside `member-profile-edit.tsx` and `church-admin-person-edit.tsx` are correctly labelled, with screen-reader focus zones intact.
- **Inactivity Warning Modal**: The modal in `SessionTimeoutWrapper` is properly initialized with accessible layout properties (`centered`, no-close-on-escape, no-close-on-click-outside) so screen readers can lock context to the extension buttons.

---

## 2. Loading and Empty States

- **Inactivity Timeout Warning**: Now shows a highly visible Mantine `Modal` warning at 14 minutes, preventing jarring, unexpected logouts and allowing users to extend their session.
- **HQ Page Loading**: Uses Mantine `Skeleton` placeholders to visually layout cards, charts, and tables while retrieving session roles and statistics, rather than blocking routes with a full-screen loading spinner.
- **Empty Arrays**: Major collection lists (directory tables, workflow logs) use fallback placeholder rows rather than throwing unhandled rendering crashes.

---

## 3. CSS/Styling & Mobile Responsiveness

- Next.js Tailwind & Mantine setup is highly responsive. The sidebar menu collapsible burger collapses into structural drawer drawers on mobile screens.
- **Member Bottom Navigation**: Correctly triggers bottom sticky menus on small screens to ensure excellent mobile app performance.

---

## 4. Top 3 UX Pain Points

1. **Transition Friction on Portal Redirects**: Landing routes redirect the user between tenant views using hard redirects, occasionally causing minor flash transitions.
2. **Audit Log Data Scarcity**: Viewing system logs displays raw table references rather than user-friendly translation labels.
3. **Modal Theme Alignment**: The inactivity timeout modal uses standard Mantine layouts; we can enhance it with red warnings or progress rings indicating remaining seconds.
