---
name: gemini-language-translation
description: Use when adding or reviewing ChurchCore locales, translated UI coverage, or localization-governance content in Gemini.
---

# ChurchCore Language Translation (Gemini)

The canonical translation pipeline and ChurchCore-specific governance warnings live in:

`../../../.claude/skills/language-translation/SKILL.md`

Read that file in full before planning or editing translation work. Apply its ChurchCore-specific notes exactly: use the existing `lib/i18n.ts` and `useI18n()` system, do not install a second i18n library, preserve `en`/`es`/`es-PR` key parity, and never treat automated translation review as human governance approval.

For implementation, use `gemini-feature-factory` and `gemini-build-with-tests`; finish with `gemini-pr-review` and the Council when required.
