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
   - **Hard-coded colours:** each of the ~390 literals is remapped to the new palette's values, by property and luminance, starting with the shell and dashboards (about a third of them sit in five files). Most stay literals — a Mantine `style`/`color` prop usually takes a colour value, not a token reference — so the sweep changes the *value*, not the syntax; only where a component already took a theme colour name (`c="dimmed"`, `color="indigo"`) does a literal become a real token. New code should prefer the token form from now on (decision 4).
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
- **Hard-coded colours:** about 390 literals across 58 files were touched by the sweep and remapped to the new palette's values. The rule depends on the property (text, background, border) and the colour's luminance:
  - real colours (red, teal, amber...) are kept;
  - the old blue accent becomes indigo.

  **Swept is not the same as eliminated.** Most of these stayed as literal colour values after the sweep — the sweep changed what colour the literal holds, not whether it's a literal — because most sit in a Mantine inline `style`/`color` prop that only accepts a colour, not a token reference. `components/theme-provider.test.ts`'s ratchet (added at Council Review 37, below) counts the literals still in `app/` and `components/` after this round's fixes at **374**; that is the enforced baseline going forward, not a defect, since real-colour literals (state, category, chart hues) and dark-token values are expected to stay literal.

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

## Addendum: Council Review 37 (2026-10-02)

**Council Review 37** (`docs/reviews/2026-10-02-council-review-37-synthesis.md`, diff-scoped, four distinct agents) confirmed D1 meets this ADR — the app is dark-first, through the theme and CSS variables, with Mantine, ChurchCore's own i18n and `church_id` all kept, and all seven items on the spec's section 8 checklist are met — then found real gaps in two places the colour sweep and the implementation notes above didn't reach, and one non-text contrast failure across the board.

**Fixed (`e1dbbf6`):**

- **Calendar month cells** were white behind now-white day numbers (a ternary the sweep's grep-based pass couldn't see). They're now the slate surface, with today indigo-tinted.
- **The check-in badge preview** stays a white printed badge, by design, but its text had taken the theme's light colours (slate-200 body, slate-400 dimmed) on that white card, unreadable. It now uses dark ink on white, matching a real printed badge.
- **Mantine's own grey CSS variables** (not a hex literal, so invisible to any literal-based sweep or regex) were still light in four places: the public giving page canvas, the sign-in icon circle, the custom-reports panel and its field pills, and an `/hq` divider. All moved to the theme's dark tokens.
- **Off-palette colours in the control plane** (`#0b1329` panels, a `#5c5fc8`/`#4c4fa8` button — never part of the sweep's mapping) moved to `dark.6` and indigo-600/500.
- **Input, checkbox and radio outlines** were slate-700, 1.8:1 against the input background — failing WCAG 1.4.11 (non-text contrast, 3:1 minimum). They're now slate-500, at 3.9:1.
- **Four calendar category colours** (administrative, liturgical, informational, internal) failed the 3:1 non-text threshold for their dot on the surface (computed 1.72–2.66:1, not the ~1.2:1 an agent first reported — see below). All four were changed so each chip's white text (≥4.5:1) and each dot (≥3:1) both pass.

**The ratchet test, `components/theme-provider.test.ts`, is the enforcement of decision 4.** It scans every `.tsx` file under `app/` and `components/` (excluding `theme-provider.tsx` itself) for colour literals and:

- fails if the count exceeds the baseline recorded when it was added (**374**, after this round's fixes) — the count can only go down from here, so a future screen must use the theme or a CSS variable instead of adding a new literal;
- fails outright if any of the pre-ADR-0026 light theme's colours appear anywhere in scope (navy text, slate-grey muted text, light canvases, the old blue primary) — so a copied light-theme snippet fails CI instead of silently rendering unreadable on the new dark theme.

**4 agent claims wrong or unsupported against source** (see the `feedback_council_synthesis_scrutiny` memory for the general pattern):

1. Agent 1's category-colour contrast figure ("~1.2:1") was wrong — computed, the dots were 1.72–2.66:1. The underlying finding (they fail the 3:1 threshold) was real.
2. Agent 3's yellow-alert contrast figure ("~2:1" with white text) was wrong — the alert's actual rendered background is `#733c00`, sampled from the screenshot, and white on it is about 8.5:1. No fix was needed.
3. Agent 4's "ADR 0026 names Portuguese as Must" was wrong — this ADR only gives `pt` its own row (decision 3); priority is the owner's call, made below.
4. Agent 2 framed the badge preview's white background itself as the defect. The white card is intentional (it previews a printed badge); the defect was its text colour, fixed above.

**New variant for the `feedback_council_synthesis_scrutiny` memory:** two agents (1 and 3) gave wrong contrast *numbers* even though each had the right formula and the right pair to check — the error was in the arithmetic or in reading the wrong rendered colour, not in not knowing how to check contrast at all. The orchestrator caught the yellow-alert figure only by sampling the actual rendered pixel from a screenshot (`#733c00`), not from source — the alert's background comes through a Mantine `Alert` colour-to-background resolution that isn't a literal in the component's own code.

**Owner decisions (2026-10-02), recorded in `DEVELOPMENT_PLAN.md` §0:**

- Portuguese (`pt`) full key parity and governance: new **Should** row (~2 days), after MVP Must work.
- Synthetic QA tenants (`churches.is_synthetic`, blocking live Stripe/email/SMS/webhooks): new **Should** row (~1 day).
- A light-mode option: new **post-MVP** row (~1.5 days) — needs the swept literals turned into CSS variables first, so a mode switch doesn't mean a second hand sweep.
- D2 (visual parity beyond colour: page scaffold, stat cards, table headers): new **post-MVP** row (~3–4 days).
- `/give/[slug]` works only in demo mode outside of it (pre-existing, found while reviewing, not part of D1's diff) — folded into **G3.1**'s scope: the public giving page must read the church's row from `public_giving_pages` in production before giving is announced (with O7).

**Readiness holds at 80/100.** D1 is the visual foundation; it closes none of the five competitive gaps, and mobile (Gap 2) was re-checked and isn't worse.
