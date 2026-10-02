# ADR 0026 — ChurchCore design system parity, through the theme

**Status**: Accepted (owner, 2026-10-02)
**Date**: 2026-10-02
**Decision owner**: Product owner (2026-10-02)

## Context

The owner adopted the **ChurchCore Design System & UI/UX Specification** as the ecosystem standard. It is written for sister apps that must match ChurchCore LMS and Orthos. Its main points:

- **Look:** dark-first, with a `slate-950` canvas, `slate-900` cards and `slate-800` borders.
- **Brand:** indigo primary with a soft glow; Inter type; `rounded-2xl` containers and `rounded-xl` controls.
- **Badges:** emerald, amber and rose state badges.
- **Implementation it assumes:** Tailwind classes everywhere, `next-intl` with `en`/`es`/`pt`, `org_id` tenancy with LMS role names, and `is_synthetic` QA tenants.

ChurchCore (this repo) is built differently, by earlier decisions:

- **UI:** Mantine 9. 192 component files import `@mantine/core`. Tailwind 4 is installed, but only about 86 class uses exist.
- **Theme:** a light theme forced on (`forceColorScheme="light"`, `components/theme-provider.tsx`), with `churchBlue` primary and Manrope and Fraunces type.
- **i18n:** its own catalog and governance (ADR 0009), `en`/`es`/`es-PR`.
- **Tenancy:** `church_id` with ChurchCore's own roles (church-admin, pastor, secretary, ministry-leader, member, plus `/hq` platform staff).

There are about 390 hard-coded colour literals in 58 files, plus `app/globals.css`.

A literal rewrite (Tailwind classes, `next-intl`, `org_id`) would take weeks and move the Nov 6, 2026 MVP well out.

## Decision

The owner chose these on 2026-10-02.

1. **Visual parity through the theme, not a rewrite.** The spec's look is mapped onto the tools ChurchCore already uses:
   - **Mantine theme:**
     - `forceColorScheme="dark"`;
     - Mantine's `dark` palette replaced with the slate scale (canvas `#020617`, surface `#0f172a`, border `#1e293b`);
     - an `indigo` primary;
     - Inter;
     - `xl` radius on containers and `lg` on controls;
     - component defaults for Paper, Card, Button, Badge, Modal, inputs and NavLink.
   - **CSS variables** in `app/globals.css`, set to the spec's values (`--background`, `--card`, `--primary`, `--border`, ...), so the few Tailwind utilities follow.
   - **Hard-coded colours:** each of the ~390 literals is replaced by a theme token or CSS variable, starting with the shell and dashboards (about a third of them sit in five files).
   - **Contrast:** every text/background pair is checked against WCAG AA (4.5:1 for body text), on top of the spec.
2. **Keep the stack where it differs on purpose.**
   - Mantine stays the component library.
   - ChurchCore's own i18n and ADR 0009 governance stay. The spec's key grouping (`common`, `nav`, ...) is followed where it fits.
   - `church_id` and ChurchCore's roles stay.
3. **Adopt two non-visual parts of the spec as their own rows:**
   - a `pt` (Portuguese) locale with full key parity and a native-speaker review, as with Spanish;
   - synthetic QA tenants. A `churches.is_synthetic` flag means a synthetic church never makes a live Stripe call, never sends email or SMS, and never delivers an outbound webhook.
4. **New screens follow the spec's look from now on**, through the theme and tokens, never through new hard-coded colours. Section 8 of the spec is the review checklist. Its Tailwind- and `next-intl`-specific items are read through decision 2.

## Consequences

- Every screen changes look in one pass, without touching component logic. The visual sweep (every page, every role) is the main cost and risk.
- **The "Sacred Clarity" landing page** (owner-confirmed 2026-09-19/20) keeps its layout and copy but takes the new tokens. The owner should confirm it now reads as intended.
- **Dark-first raises the contrast risk.** Every existing contrast fix (Council Review 11, and the Mantine 9 NavLink active-state rule) must be checked again.
- **Fonts:** Inter replaces Manrope as the sans face, as a local variable font like the current ones. Fraunces stays the serif accent until the owner says otherwise.
- **Out of scope:** Tailwind classes replacing Mantine components, `next-intl`, and renaming `church_id` to `org_id`. Revisit only by a new ADR.

## Implementation notes (D1, 2026-10-02)

- **Theme** (`components/theme-provider.tsx`):
  - `forceColorScheme="dark"`. The page also renders dark on the server (`data-mantine-color-scheme="dark"` in `app/layout.tsx`), so there's no light flash.
  - Mantine's `dark` palette is rebuilt from the spec's slate roles:

    | Slot | Role | Colour |
    |---|---|---|
    | 0 | text | slate-200 |
    | 2 | dimmed text | slate-400 |
    | 4 | borders | slate-700 |
    | 5 | hover | slate-800 |
    | 6 | inputs, default buttons | `#0b1222`, recessed below the surface |
    | 7 | surfaces | slate-900 |
    | 9 | canvas | slate-950 |
  - `indigo` is Tailwind's indigo; the primary is indigo-600.
  - The radius scale maps `lg` to rounded-xl (controls) and `xl` to rounded-2xl (containers).
  - Font: Inter, a local variable font (OFL), replacing Manrope. Fraunces stays as the serif accent.
  - **`churchBlue`**, the old primary's name, used about 100 times, is kept as an alias of the indigo palette, so those components follow the new primary without edits.
- **CSS variables** (`app/globals.css`): set to the spec's values. Also there:
  - the body canvas (slate-950 with a soft indigo glow);
  - the shell's nav links (indigo-600 active, solid, with `!important` per the Mantine 9 NavLink rule);
  - a glow on filled buttons in their own colour;
  - a matching border on light badges;
  - **print styles that switch back to dark ink on white.**
- **Hard-coded colours:** about 390 literals in 58 files were mapped to the tokens. The rule depends on the property (text, background, border) and the colour's luminance:
  - real colours (red, teal, amber...) are kept;
  - the old blue accent becomes indigo.

  The landing page's palette constants were remapped by hand. The landing adds `ACCENT_TEXT` (indigo-400) for accent-coloured text, because indigo-600 text on the canvas is only about 3.3:1.
- **Contrast checked (WCAG AA):**

  | Pair | Ratio |
  |---|---|
  | body text on surface | 14.5:1 |
  | dimmed on surface | 7.0:1 |
  | white on the indigo-600 button | 6.3:1 |
  | indigo-400 link or nav text | 6.0:1 |
  | the member bottom nav's active colour | 6.0:1 (was `#1a56db`, about 2.5:1 on the new surface) |

  **One known exception:** placeholders use the spec's slate-500, at 4.2:1 on inputs. Placeholder text isn't content, and this keeps the spec's value.
- **Teal stays as ChurchCore's secondary accent** (about 90 uses: check-in, success-adjacent states), alongside the spec's emerald, amber and rose states. The shell's brand mark, its nav and the church-context pill are indigo, per the spec.
- **Found while checking:**
  - A calendar test only ever passed because the "today" circle shared the worship category's blue. It now checks the event's own chip.
  - A member-directory row overflowed a phone screen with a long email. The row now wraps.
- **Visual check:** before and after screenshots of 25 pages across every role, at desktop and phone widths. The full page × role e2e sweep also ran.
