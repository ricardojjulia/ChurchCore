# Council Agent 3: UX & Shell Audit — ChurchCore Challenge

**Date:** 2026-06-21  
**Auditor:** Agent 3 — UX, Design & Shell Integrity  
**Status:** Complete  

---

## 1. ARIA & Accessibility Compliance

We scanned the core UI component layers (utilizing Mantine and Lucide packages):
- **Burger Menu**: Includes a proper string-based `aria-label="Toggle navigation"`.
- **Bottom Navigation**: Buttons are correctly assigned dynamic label keys `aria-label` matching internationalized localized translations (e.g., `aria-label={label}`).
- **Mismatches**: Tooltips and icon-only buttons (such as edit buttons on member cards and delete icons) lack explicit `aria-label` properties, which makes them screen-reader blind.

---

## 2. Shell Active States & Layout Consistency

- **Calculation Discrepancy**:
  - `app-shell.tsx` relies on parent pages/routes passing down an `active?: boolean` attribute in `navItems`.
  - `member-bottom-nav.tsx` evaluates current paths dynamically by running `usePathname()` and checking segment inclusions (`item.includes?.some(...)`).
- This inconsistency means developers must manually wire active flags when extending the admin sidebar, whereas the member bottom nav handles routing updates automatically.

---

## 3. Loading, Empty & Error States

- **Jarring Layout Shifts**: While the Project HQ dashboard (`/hq`) uses Mantine `Skeleton` blocks to match layout placeholders, other data-heavy dashboards (giving dashboards, member lists, and calendar views) still trigger absolute-positioned loader spinners. This causes shifting content sizes when data resolves.
- **Empty Collections**: When list collections are empty, the app renders generic blank cards or text strings. There is a lack of structured empty state states with actionable prompts (e.g. "No events scheduled. Create one to get started").
- **Error Boundaries**: A generic `error.tsx` boundary exists at the app level, but nested features (like CSV upload parsing forms) lack local error boundaries. A parse failure inside a server action bubbles up and crashes the page view, forcing a full browser reload.

---

## 4. Top 3 UX Challenges

1. **Unify Active Navigation Logic**: Standardize the sidebar navigation in `app-shell.tsx` to automatically resolve the `active` state using `usePathname()` rather than relying on manual parent state injection.
2. **Actionable Empty States**: Introduce structured empty-state components with icons and "Create/Import" action buttons for all empty directories and transaction lists.
3. **Graceful Local Error Boundaries**: Enclose the import wizard steps and forms in localized ErrorBoundary wrappers, allowing users to dismiss import failures without resetting their full browser workspace session.
