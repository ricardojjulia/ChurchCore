# Spanish/es-PR Catalog Linguistic Review — Results and Scrutiny

**Date:** 2026-09-18
**Scope:** Workstream 1 from `docs/reviews/2026-09-18-spanish-translation-evaluation.md` — native-speaker-style review of the *existing* 1,010-key `es`/`es-PR` catalog in `lib/i18n.ts`, per the gap ADR 0009 Decision 5 names explicitly (the catalog was written by engineering and has never had linguistic review).

---

## What was done

A review agent was asked to check every key in `es` and `es-PR` against `en` for naturalness, register, domain terminology, idioms, and cross-namespace consistency, and to specifically assess whether `es-PR` is genuinely differentiated for a Puerto Rican audience or just a duplicate of `es`.

**Its report is not taken at face value below.** Per this session's own established practice (an agent's narrative summary can contradict its own detailed findings or be stale — see `feedback_council_synthesis_scrutiny.md`), every claim was checked against the actual file before anything was changed.

## What was verified as genuine and fixed

Six objective errors, confirmed by direct inspection of `lib/i18n.ts` before editing, applied, then re-verified:

| Locale | Namespace.key | Before | After |
|---|---|---|---|
| es | `member.quickActions` | `Acciones rapidas` | `Acciones rápidas` |
| es | `publicHome.faithSubline` | `Menos carga administrativa. Mas espacio para oracion, personas y mision.` | `Menos carga administrativa. Más espacio para oración, personas y misión.` |
| es | `publicHome.lanePrayer` | `Peticiones de oracion` | `Peticiones de oración` |
| es | `publicHome.laneWorship` | `Servicio de adoracion` | `Servicio de adoración` |
| es | `member.mobile_member` | `miembro movil` | `miembro móvil` |
| es-PR | `financeJournal.memo` | `Memo` (left untranslated) | `Nota` (matching `es`'s existing correct value) |

These are unambiguous: four missing-accent spelling errors, one more of the same, and one string that was never translated at all. No judgment call involved.

**Verification after editing:**
- Key-leaf count unchanged: `en`/`es`/`es-PR` all still 1,010 — no keys added, removed, or restructured.
- `npx tsc --noEmit` — clean, 0 errors.
- `npx vitest run lib/i18n-ws-c4-coverage.test.ts` — 217/217 passing.

## What the report also claimed, and why it was not applied

The same report claimed **94 corrections in `es`** and **7 in `es-PR`** beyond the six above. Cross-checking surfaced enough problems that the rest is being treated as unverified, not as findings to act on:

1. **The agent admitted shortcutting the majority of its own claimed count.** For ~60 of the 94 `es` corrections, it wrote: *"Rather than list all 60 remaining keys individually... here is the precise mapping for efficient batch correction"* — and proposed blind find-replace patterns (`s/Agrega /Añade /g`, `s/Aún /Todavía /g`, `s/requiere /necesita /g`) instead of the per-key review it was asked to do. A global find-replace across a 1,010-key catalog risks hitting words in contexts where the "correction" doesn't fit — exactly the kind of shortcut this session's own practice is to catch rather than trust.

2. **The report contradicts itself on regional differentiation.** Its own "es-PR Regional Differentiation" section correctly identifies `Rol→Función`, `Ubicación→Lugar`, `dispositivo→celular`, and `iglesia→congregación` as *"not errors... expert localizations that improve usability for Puerto Rican congregations."* Its "Terminology Decisions" glossary then recommends `es` should *"migrate toward"* those same Puerto-Rico-specific choices — which would erase the exact regional distinction the report just praised. Direct file inspection confirmed both facts are real (es-PR does use the differentiated terms; es-PR was not flagged as needing to change them) — the report simply didn't cross-check its own two sections against each other. Not applied.

3. **The capitalization suggestions likely violate Spanish orthography, not fix it.** The report proposed capitalizing `iglesia`→`Iglesia` and `ofrendas`→`Ofrendas` in role/nav labels (`Administrador de iglesia`→`Administrador de Iglesia`, `Operaciones de ofrendas`→`Operaciones de Ofrendas`) on a "consistency" rationale. Spanish capitalizes common nouns and role titles far less liberally than English — treating this as an error is itself a common English-influenced mistake. Confirming this: `churchAdmin` appears twice in `es` (both lowercase) and twice in `es-PR` (also both lowercase, unflagged by the report's own separate 7-item `es-PR` list) — the report didn't apply its own rule consistently even within itself. Not applied.

4. **A duplicated, contradictory correction for the same key.** `readiness.detailPreviewChildren` in `es` received two different proposed rewrites in the same report (one to "seguridad de menores," a separate one to "para el cuidado seguro de menores") without acknowledging `es-PR`'s own already-different existing phrasing ("seguridad de niños"). All three are defensible Spanish; none is an error. Not applied.

5. **At least one domain claim is contestable on its own terms.** The report called `culto` (for Sunday worship) "archaic" in favor of `servicio`. `Culto` is in active, current, mainstream use for "worship service" across Pentecostal/Evangelical Spanish-speaking congregations — arguably at least as common as `servicio` in that specific register. Not applied.

## Conclusion

This pass closed the unambiguous-error slice of the gap ADR 0009 named — real spelling mistakes and one untranslated string, now fixed and verified. **It did not, and should not be represented as, the human native-speaker linguistic review the governance system's `in_linguistic_review` state exists for.** The governance catalog version's state is intentionally left unchanged (`validated`, not advanced) — an automated review that contradicts itself on regional dialect and admits shortcutting most of its own count is not a substitute for the actual human sign-off step (`requestReview()`/`submitReview()` in `lib/localization-governance/adapter.ts`) that ADR 0009 always intended to close this gap. That step still needs an actual person.

## Follow-up

- The remaining ~89 `es` / 6 `es-PR` proposed wording changes are **not** carried forward as a to-do list — most weren't genuinely reviewed (see finding 1), and several of the individually-specified ones are wrong on inspection (findings 2–5). A future pass should not reuse this report as a starting checklist.
- If another automated linguistic pass is run in the future, scope it to one namespace at a time (not all 1,010 keys in one call) and explicitly instruct it not to conflate "regional variant" with "error," and not to shortcut any portion of its own assigned review.
- The real fix remains: get an actual human Spanish-speaking reviewer (ideally someone connected to Casa de Refugio ES, the pilot tenant) to run the governance review flow for real.
