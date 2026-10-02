# Council Review 37 — Synthesis (D1: ChurchCore design system through the theme)

**Branch:** `feat/design-system-parity-d1` (two commits: the theme, then the Council fixes) vs `main`. Diff-scoped, four distinct read-only agents (`2026-10-02-council-review-37-agents-1-4.md`).

## Verdict

**D1 meets ADR 0026.** The app is dark-first: slate surfaces, indigo primary, Inter, and the spec's radii, pills and glow. It gets there through the Mantine theme and the CSS variables, with Mantine, ChurchCore's i18n and `church_id` all kept. All seven items on the spec's section 8 checklist are met.

The Council found real gaps in two places:
- spots the colour sweep couldn't see: a ternary in the calendar grid, and Mantine's grey CSS variables;
- non-text contrast: input borders, and the calendar category dots.

All are fixed. Decision 4 is now enforced by a test.

## Fixed after Council

- **Calendar month cells:** the slate surface, behind readable day numbers.
- **Badge preview:** dark ink on the white printed-badge card.
- **Panels the sweep missed** (they used Mantine grey variables): the public giving canvas, the sign-in icon circle, the custom-reports panel and pills, and an `/hq` divider.
- **Control plane:** its off-palette colours now come from the theme.
- **Input, checkbox and radio outlines:** slate-500, at 3.9:1 (WCAG 1.4.11).
- **Four calendar category colours:** changed so each chip and dot passes AA.
- **`components/theme-provider.test.ts`:** a ratchet. Colour literals in `app/` and `components/` may only go down, and the old light palette is banned.

## Wrong or unsupported agent claims (4)

1. **A1:** "category colours ~1.2:1." Actual: 1.72–2.66:1. The issue is real; the number was wrong.
2. **A3:** "yellow alert with white text ~2:1." Actual: about 8.5:1 on the rendered `#733c00`.
3. **A4:** "ADR 0026 names Portuguese as Must." It doesn't.
4. **A2** framed the white badge preview as the defect. The white card is intentional; its text colour was the defect.

## Found while reviewing (pre-existing, outside D1)

- **`/give/[slug]` is a scaffold.** Outside demo mode it returns "not found", and the production query of `public_giving_pages` was never written (its own comment says so). The church's public giving link therefore works only in the demo.

## Proposed (owner decision)

| # | Item | Proposal |
|---|---|---|
| 1 | Portuguese (`pt`): full key parity (~1,170 keys) plus ADR 0009 governance, and a native-speaker review as an owner action | **Should** row (~2 days), after the Must work. Alternative: Must, using about 2 of the ~5 slack days. |
| 2 | Synthetic QA tenants: a `churches.is_synthetic` flag that blocks live Stripe, email/SMS and outbound webhooks | **Should** row (~1 day). |
| 3 | Light-mode option, for bright rooms, kiosks and readability preferences | **Should** row, after MVP (~1.5 days). It needs the swept literals turned into CSS variables first. |
| 4 | Visual parity beyond colour (D2): page scaffold, stat cards, table headers | **Post-MVP** row (~3–4 days). |
| 5 | `/give/[slug]` works only in demo mode | **Add to G3.1/G3.3 scope.** The public giving page must read `public_giving_pages` in production before giving is announced (with O7). |

## Readiness

**Holds at 80/100.** D1 is the visual foundation. It closes none of the five gaps, and mobile (Gap 2) was re-checked and isn't worse.
