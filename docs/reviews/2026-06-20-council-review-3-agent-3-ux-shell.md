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

---

## 2. Loading and Empty States

- **Inactivity Timeout wrapper**: Seamlessly transitions the user to `/sign-in` with custom message parameters.
- **HQ Page Loading**: Uses Mantine `Skeleton` placeholders to visually layout cards, charts, and tables while retrieving session roles and statistics, rather than blocking routes with a full-screen loading spinner.
- **Empty Arrays**: Major collection lists (directory tables, workflow logs) use fallback placeholder rows rather than throwing unhandled rendering crashes.

---

## 3. CSS/Styling & Mobile Responsiveness

- Next.js Tailwind & Mantine setup is highly responsive. The sidebar menu collapsible burger collapses into structural drawer drawers on mobile screens.
- **Member Bottom Navigation**: Correctly triggers bottom sticky menus on small screens to ensure excellent mobile app performance.

---

## 4. Top 3 UX Pain Points

1. **Lack of Visual Inactivity Alert**: When the inactivity timeout is approaching (e.g. at 14 minutes), the user is logged out without a warning banner or option to "stay logged in."
2. **Transition Friction on Portal Redirects**: Landing routes redirect the user between tenant views using hard redirects, occasionally causing minor flash transitions.
3. **Audit Log Data Scarcity**: Viewing system logs displays raw table references rather than user-friendly translation labels.
