# ChurchCore Agent Rules

- Read `DEVELOPMENT_PLAN.md` before proposing or implementing changes.
- Treat `DEVELOPMENT_PLAN.md` as the source of truth for stack, structure, and release discipline.
- Keep the repo aligned with the documented directory structure. Do not add ad hoc folders.
- Favor mainstream, well-supported dependencies. Use an ADR before introducing anything unusual.
- Update `README.md`, `CHANGELOG.md`, and relevant docs in `/docs` with every meaningful feature change.
- Document meaningful factory runs transparently: intent, architecture impact, verification commands/results, residual risk, and follow-up work must be captured in committed docs or handoff notes, not only in chat.
- Verify work with `npm run lint`, `npm run build`, and `npm run test:surfaces` before handoff when feasible.
- Do not push directly to `main`. Use a feature branch, push the branch, open a pull request, merge through GitHub after required checks/review, then pull `main`.
- **`main` requires verified commit signatures** (branch protection: `required_signatures`). A commit can be cryptographically signed by a valid, registered SSH/GPG key and still show as unverified on GitHub — the commit's author/committer email must also be a *verified* email on the signer's GitHub account, not a placeholder like `your-email@example.com`. Before opening or updating a PR against `main`, check each commit: `gh api repos/<owner>/<repo>/commits/<sha> --jq '.commit.verification'` should report `"verified": true`. If it reports `"reason": "unverified_email"`, the fix is rewriting that commit's author/committer to a verified address (e.g. the GitHub-issued `<id>+<user>@users.noreply.github.com` email) — via `--author`/`GIT_COMMITTER_EMAIL` on the affected commits, not by changing global git config on someone else's machine. A green CI run does not imply signature verification; check it explicitly.
- **The Council runs before every non-trivial merge to `main`.** This is a mandate, not a suggestion — see `improve-software.md` §0 for scope and exceptions. The Council is 4 read-only audit agents (database/API, routes/pages, UX/shell, feature/competitive) plus a 5th **Documenter** agent that closes the loop: updates `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, README/docs, finalizes ADRs, and records memory after verification is clean. A PR for non-trivial work references its council synthesis (`docs/reviews/`) and confirms Documenter sign-off in the description.
- **Every change ships its test surfaces.** A PR that adds or changes a page, API route, or server action must update its entry in `tests/coverage-manifest.json` (allowed roles read from the code's real gates, never guessed) and ship the tests that entry points to. `npm run test:surfaces` runs in the CI `verify` job and fails on any unregistered, stale, or untested surface; the CI `e2e` job runs the full browser and API suite (every page × every role, every API route) against local Supabase on every PR. Both block merge once a repo admin marks them as required status checks (a one-time GitHub setting; see `docs/testing.md`), and the rule applies to small changes too. A new server-action export must be named in a test that imports or mocks its module, or be listed in that module's `untestedExports` with a reason. See `docs/testing.md`.
- For Claude Code sessions, use repo-local skills in `.claude/skills/` as the Claude-compatible software-factory workflow:
  - `council` to run the Council review and Documenter close-out (`.claude/skills/council/`, subagent `.claude/agents/documenter.md`).
  - `feature-factory` for non-trivial feature planning and orchestration.
  - `build-with-tests` for implementation work.
- For Codex sessions, use repo-local skills in `.codex/skills/` as the Codex-compatible software-factory workflow:
  - `churchcore-council` to run the Council review and Documenter close-out.
  - `churchcore-feature-factory` for non-trivial feature planning and orchestration.
  - `churchcore-build-with-tests` for implementation work.
  - `churchcore-pr-review` for review before merge or PR handoff.
- For Gemini (Antigravity) sessions, use repo-local skills in `.gemini/skills/` as the Gemini-compatible software-factory workflow:
  - `gemini-council` to run the Council review and Documenter close-out.
  - `gemini-feature-factory` for non-trivial feature planning and orchestration.
  - `gemini-build-with-tests` for implementation work.
  - `gemini-pr-review` for review before merge or PR handoff.
- Treat `.claude/` as Claude Code-specific factory configuration, `.codex/` as Codex-compatible factory configuration, and `.gemini/` as Gemini-specific factory configuration. Keep all surfaces aligned when changing the workflow — the Council and Documenter mandate applies identically across all three.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
