# UI Stack Migration Plan — Mantine → Target Stack

**Status:** Option / Deferred  
**Last reviewed:** April 25, 2026  
**Current stack:** Mantine v9 (`@mantine/core`, `@mantine/hooks`, `@mantine/notifications`)  
**Target stack:** Tailwind CSS 4 · shadcn/ui · Base UI (`@base-ui/react`) · Sonner · Lucide React

---

## Why this exists

The current codebase uses Mantine as its primary component library. The target stack replaces it with a lighter, more composable set that aligns with the shadcn/ui `components.json` convention already in place. This document captures the scope, strategy, and component mapping so the migration can be executed when prioritised.

---

## Scope

- **99 TypeScript/TSX files** import from `@mantine/core`, `@mantine/hooks`, or `@mantine/notifications`.
- **42 uses** of `useDisclosure` (from `@mantine/hooks`).
- **~10 files** use `notifications.show(…)` from `@mantine/notifications`.

### Mantine components by frequency

| Component | Uses | Target replacement |
|---|---|---|
| `Group` | 19 | `<div className="flex items-center gap-…">` |
| `Text` | 18 | `<p className="…">` or semantic element |
| `Stack` | 16 | `<div className="flex flex-col gap-…">` |
| `Paper` | 14 | `<div className="rounded-lg border bg-card p-…">` |
| `Title` | 13 | `<h2 className="…">` etc. |
| `Badge` | 13 | shadcn `Badge` |
| `Button` | 8 | shadcn `Button` |
| `ThemeIcon` | 7 | Tailwind `<span>` + Lucide icon |
| `SimpleGrid` | 6 | Tailwind CSS Grid (`grid grid-cols-…`) |
| `Table` | 5 | shadcn `Table` |
| `Tabs` | 4 | Base UI `Tabs` |
| `Alert` | 3 | shadcn `Alert` |
| `Modal` | 1 | Base UI `Dialog` |
| `Select` | 1 | Base UI `Select` |
| `NumberInput` | 1 | shadcn/Base UI `NumberField` |
| `Switch` | 1 | shadcn `Switch` |
| `Textarea` | 1 | shadcn `Textarea` |
| `RingProgress` | 2 | Custom SVG or recharts `RadialBarChart` |
| `MantineProvider` | 3 | Remove (Sonner `<Toaster>` in layout) |
| `mantineHtmlProps` | 1 | Remove from `layout.tsx` |

---

## Recommended migration sequence

### Step 1 — Shim layout primitives (highest leverage)

Create the following thin Tailwind wrappers in `components/ui/`. These replace ~86 import instances mechanically.

```
components/ui/group.tsx        → flex row wrapper
components/ui/stack.tsx        → flex column wrapper
components/ui/paper.tsx        → rounded card wrapper
components/ui/text.tsx         → styled paragraph
components/ui/title.tsx        → styled heading
components/ui/simple-grid.tsx  → CSS grid wrapper
```

Each file is ~15 lines. Once added, update the import path in each consumer; the API surface (`className`, `children`) is compatible.

### Step 2 — Local `useDisclosure` hook

Add `hooks/use-disclosure.ts`:

```ts
import { useState } from "react";

export function useDisclosure(initial = false) {
  const [opened, setOpened] = useState(initial);
  return {
    opened,
    open: () => setOpened(true),
    close: () => setOpened(false),
    toggle: () => setOpened((v) => !v),
  };
}
```

Replace `import { useDisclosure } from "@mantine/hooks"` → `import { useDisclosure } from "@/hooks/use-disclosure"` across all 42 files.

### Step 3 — Toast notifications

Install Sonner:
```
npm install sonner
```

- Add `<Toaster />` to `app/layout.tsx`.
- Replace `notifications.show({ title, message, color: "red" })` with `toast.error(message)` etc.
- Remove `@mantine/notifications` import and `<Notifications />` from `theme-provider.tsx`.
- ~10 files affected.

### Step 4 — Interactive components

Install Base UI:
```
npm install @base-ui/react
```

Swap these Mantine components to Base UI equivalents:
- `Tabs` → `@base-ui/react` `Tabs` (4 files: `church-admin-event-workspace.tsx`, `church-admin/events/[id]/page.tsx`, `church-admin/giving/page.tsx`, `finance-reports-workspace.tsx`)
- `Modal` → `@base-ui/react` `Dialog` (1 file: `member-schedule.tsx`)
- `Select` → `@base-ui/react` `Select` (1 file: `tenant-view-controls.tsx`)
- `NumberInput` / `Switch` → shadcn equivalents (1 file each: `church-admin-event-workspace.tsx`)

### Step 5 — Remove Mantine

After all files are clear:

1. Uninstall packages:
   ```
   npm uninstall @mantine/core @mantine/hooks @mantine/notifications
   ```
2. Remove `optimizePackageImports` entries from `next.config.ts`.
3. Remove Mantine CSS imports from `app/layout.tsx`.
4. Simplify `components/theme-provider.tsx` — replace `MantineProvider` / `createTheme` with just `<Toaster>` or a plain wrapper.
5. Update test wrappers in `member-bottom-nav.test.tsx` and `sign-in/page.test.tsx` (remove `MantineProvider`).

---

## Effort estimate

| Phase | Files touched | Effort |
|---|---|---|
| Shim primitives + update imports | ~86 import sites across ~70 files | Medium |
| `useDisclosure` hook + swap | 42 files | Low (search-replace) |
| Sonner swap | ~10 files | Low |
| Base UI interactive components | 6 files | Medium |
| Mantine removal + cleanup | ~5 files | Low |
| **Total** | **~99 files** | **~2–3 focused sessions** |

---

## Notes

- `RingProgress` (2 uses) has no direct Base UI / shadcn equivalent. Options: custom SVG ring, recharts `RadialBarChart`, or a CSS conic-gradient approach.
- The `ThemeIcon` pattern (icon inside a coloured circle) maps cleanly to `<span className="inline-flex items-center justify-center rounded-full bg-… text-…">`.
- shadcn `Badge`, `Button`, `Alert`, `Table`, `Switch`, `Textarea` are already supported by the existing `components.json` — run `npx shadcn@latest add <component>` as needed.
- Base UI components are unstyled by default; Tailwind classes will need to be applied to match the current visual design.
