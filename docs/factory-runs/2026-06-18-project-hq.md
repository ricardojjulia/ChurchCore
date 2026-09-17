# Factory Run: ChurchCore LMS — Project HQ

**Date:** 2026-06-18
**Factory surface:** Gemini (Antigravity)
**Workflow:** `gemini-feature-factory`, `gemini-build-with-tests`
**Status:** Implemented locally; build and type verification passing

## Intent

Build the `/hq` Project Governance Dashboard for administrators and managers, backed by an AI proxy endpoint and robust database role-based policies. Align the repository with the new Gemini software-factory workflow surface.

## Story and Acceptance Criteria

As an LMS administrator or manager, I need a secure, centralized dashboard to monitor project governance (tasks, risks, decisions) and consult an AI advisor using historical institutional memory without exposing sensitive data (PII) or keys.

Acceptance criteria:
- Enable Row Level Security (RLS) on all HQ tables (`hq_sessions`, `hq_tasks`, `hq_risks`, `hq_decisions`).
- Policies use `public.current_user_role()`, resolving permissions properly per profile role: Platform admins and `church_admin` get full CRUD, `pastor_elder`/`secretary`/`ministry_leader` get read-write (no delete), `teacher` gets read-only, and regular `member` is denied access.
- Build a secure server-side AI proxy at `/api/ai` to consult Claude without leaking the `ANTHROPIC_API_KEY` and scrubbing all PII (emails, IDs/UUIDs) from prompts.
- Persist interaction sessions in `hq_sessions` and log them to the database.
- Maintain Next.js App Router and Mantine UI styles, supporting dynamic badges, responsive grids, and creation/edition modal dialogs.
- Register the Gemini factory workflow surface in `AGENTS.md`, `README.md`, and `docs/software-factory.md`.

## Technical Brief

- Database migrations define `public.current_user_role()` mapping helper. RLS policies enforce access control based on user role.
- `/api/ai/route.ts` validates the Supabase session, scrubs input string of email patterns and UUID structures, and makes a secure server-to-server call using the Anthropic Node SDK.
- `/hq/page.tsx` renders the visual tabs and modals. It constructs a mock workspace shell context mapping users to their correct workspace view (`control` path for super-admins, standard church portal otherwise) to prevent Next.js compilation layout breaks.

## Implementation Summary

Created/Modified files:
- `supabase/migrations/20260713000000_hq.sql` [NEW]
- `app/api/ai/route.ts` [NEW]
- `app/hq/page.tsx` [NEW]
- `.gemini/skills/gemini-feature-factory/SKILL.md` [NEW]
- `.gemini/skills/gemini-build-with-tests/SKILL.md` [NEW]
- `.gemini/skills/gemini-pr-review/SKILL.md` [NEW]
- `.gemini/skills/gemini-feature-factory/references/agent-roles.md` [NEW]
- `AGENTS.md` [MODIFY]
- `docs/software-factory.md` [MODIFY]
- `README.md` [MODIFY]
- `package.json` [MODIFY]
- `next.config.ts` [MODIFY]
- `proxy.ts` [MODIFY]
- `CHANGELOG.md` [MODIFY]

## Verification

- **Production Build**: Successful compiler build (`npm run build`) completed successfully with zero TypeScript or compilation errors.
- **Linter**: Targeted ESLint (`npx eslint app/hq/page.tsx app/api/ai/route.ts`) completed with zero errors or warnings.
- **Unit Tests**: Executed `npm run test` (Vitest) confirming all existing database configuration and service tests pass.
- **RLS Audit**: Executed `npm run audit:rls` which completed successfully.

## Residual Risk

- Manual UI browser tests could not be completed via browser subagents due to playwright CDP connection restrictions on the local runner platform.
- Suppressing next barrel loader optimizations in Next.js build is currently required for dev server packaging consistency.

## Delivery

- **Branch**: `fix/people-mobile-filters`
- **Pull request**: Pending merge to `main`
