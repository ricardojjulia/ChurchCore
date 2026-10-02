# Council Review 37 — Agent reports (D1: ChurchCore design system through the theme)

**Branch:** `feat/design-system-parity-d1` vs `main` (`adeed15`). Diff-scoped. Four distinct read-only `codebase-researcher` agents, with roles adapted to a visual change; the agents read the before and after screenshots. Each report is condensed below, with the orchestrator's check of each claim against source, computation or the screenshots.

## Agent 1 — Code integrity

- **(Critical) The control plane uses colours that aren't in the theme** (`#0b1329` panels; a `#5c5fc8`/`#4c4fa8` button).
  - *Check:* real.
  - *Fixed:* `dark.6`, and indigo-600/500.
- **(Critical) Calendar category colours fail on dark: "~1.2:1".**
  - *Check:* real, but the figure is wrong. Computed, the dots are 2.36:1 (administrative) and 1.72:1 (internal), and liturgical is 2.66:1, all under the 3:1 non-text threshold.
  - *Fixed:* four colours changed. Each now passes both checks: white text on the chip (4.5:1 or better) and the dot on the surface (3:1 or better).
- **(High) Custom-reports field pills are white on a `gray-0` panel.**
  - *Check:* real. The sweep couldn't see Mantine's grey CSS variables.
  - *Fixed.* The same blind spot also hit the public giving page canvas, the sign-in icon circle and an `/hq` divider; all fixed.
- **(High) `color: "#ffffff"` on a control-plane title.** Correct on dark, so this is a style preference. No change.
- **Print CSS:** in place. No print regression test exists. Noted.
- **Verified:** no `--font-manrope` references remain; `churchBlue` is aliased; the manifest and layout are right.

## Agent 2 — Pages

- **(Critical, marked UNVERIFIED by the agent) Calendar month cells are `#fff`/`#eff6ff` behind white day numbers.**
  - *Check:* **real, and confirmed.** The month grid sat below the screenshots' viewport.
  - *Fixed:* a full-page capture now shows a readable grid.
- **(Critical) The badge preview has a white background.**
  - *Check:* real, though not as framed. A white badge is intended, since it previews the printed badge. The defect was its text, which took the theme's light colours: slate-200 body text and `dimmed` slate-400 on white.
  - *Fixed:* dark ink on the white card.
- **Double-active nav items, and truncated quick actions or "Request Demo":** pre-existing, confirmed against the before shots.
- **Coverage:** the screenshots covered 25 of 117 pages. The full page × role e2e sweep ran, which proves the pages render but not how they look. The risk of light literals that remain on unseen pages is now bounded by the new ratchet test's banned-palette check.

## Agent 3 — UX and accessibility

- **(Critical) Input borders are 1.84:1, failing WCAG 1.4.11.**
  - *Check:* **real** (computed 1.80:1 against the input background).
  - *Fixed:* input, checkbox and radio outlines are slate-500, at 3.9:1.
- **(Critical) Category colours.** Same as Agent 1; fixed.
- **(Critical) Yellow alert with white text is "~1.9–2.0:1".**
  - *Check:* **wrong.** The rendered alert background (sampled from the screenshot) is `#733c00`, and white on it is about 8.5:1.
- **Spec section 8 checklist:** all seven items met.
- **Risks:**
  - No light-mode option, for bright rooms, kiosks and older congregants. The spec calls dark the baseline, not the only mode. Raised as owner proposal 3.
  - No `prefers-reduced-motion` rule. There is little custom motion to reduce, so this is Low.

## Agent 4 — Spec and plan fit

- **ADR 0026 decisions 1 and 2:** met.
- **Decision 3** (Portuguese, synthetic tenants): not started. Correct, since they're separate rows.
- **Decision 4:** had no enforcement.
  - *Fixed with a variant of the agent's proposal:* the ESLint ban it suggested would fail on the ~240 legitimate colour literals that remain. Instead, a ratchet test (`components/theme-provider.test.ts`) allows the count only to fall and bans the old light palette.
- **Beyond colour:** the page scaffold, stat cards and tables (D2) would take about 3–4 days, post-MVP.
- **Plan:** proposes rows. Pt as Must (~2 days), synthetic tenants as Should (~1 day), D2 post-MVP.
- **"ADR 0026 decision 3 names Portuguese as Must":** *check:* **wrong.** The ADR only says these get their own rows; priority is the owner's call (proposal 1).
- **Readiness:** stays at 80. D1 is a foundation and closes no gap. Agreed.
