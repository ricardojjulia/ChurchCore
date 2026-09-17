# Council Agent 3: UX & Shell Quality Audit — ChurchCore LMS

**Date:** 2026-06-18
**Auditor:** Agent 3 — UX & Shell Quality Audit
**Status:** Complete

---

## 1. ARIA Correctness & Accessibility

* **App Shell Header**: The Burger menu uses `aria-label="Toggle navigation"` correctly.
* **Member Bottom Nav**: Buttons are defined using `UnstyledButton` with explicit `aria-label` labels fetched dynamically from i18n helper keys.
* **Gaps**: Many table operations buttons (e.g. edit/delete action icons in `hq/page.tsx` and `church-admin/people`) do not have `aria-label` descriptors, which can impair screen reader usability.

---

## 2. Loading & Empty States

* **Dashboard & Modals**: Tables handle empty states cleanly. For example, [page.tsx](file:///Users/rjulia/ChurchCore/app/hq/page.tsx#L653-L658) displays a single spanned table cell message `"No tasks found."` if the array length is zero.
* **Data Loaders**: Utilizes Mantine's `<Loader color="teal" />` component during asynchronous page renders.
* **Gaps**: When lists are empty, there are no call-to-action (CTA) buttons suggesting the user add their first item, leaving pages visually stark.

---

## 3. CSS & Responsive Design

* Styling is driven by `@mantine/core` and Tailwind CSS.
* **Mobile responsiveness**: AppShell navbar automatically collapses into a burger drawer on viewports smaller than `md`. The member shell relies on a custom bottom navbar which fits standard mobile screen ratios.
* **Print Styles**: There are no default print media query overrides in `globals.css`, which is a limitation when printing receipts, rosters, or financial journal ledgers.

---

## 4. Shell Nav Active State

* Active states are managed via `usePathname()` checks inside `components/application/app-shell.tsx` and `components/application/member-bottom-nav.tsx`.
* It utilizes explicit boolean flags:
  * `isActive = pathname === item.href` (exact matching)
  * `pathname.startsWith(item.href)` (sub-route matching)
* Visual indicators (teal highlights for admin staff, blue icons/text for members) are harmoniously applied.

---

## 5. Error Handling & Boundaries

* Server-side actions utilize standard try-catch blocks and display error logs using `@mantine/notifications` toasts.
* Next.js `error.tsx` layouts are registered to capture unhandled runtime errors in page trees.
* **Gaps**: Some database errors (e.g., policy checks on deletion) bubble raw Postgres exceptions (e.g. `new row violates row-level security policy`) to the UI toasts, instead of user-friendly validation warnings.

---

## 6. Top 3 UX Pain Points

1. **Loader Screen Blocking**: Auth verification on `/hq` blocks the full viewport with a central spinner instead of loading partial components in skeleton containers.
2. **Raw Database Toasts**: Policy violations display technical SQL errors instead of clean explanations (e.g., *"You do not have permission to delete this task"*).
3. **No Keyboard Traversal**: Modals and listing tables lack tab-key navigation support, preventing rapid keyboard-only data management.
