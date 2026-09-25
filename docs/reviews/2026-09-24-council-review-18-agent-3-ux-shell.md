# Council Review 18 — Agent 3: UX & Shell Audit

**Branch:** `feat/e2e-testing-foundation` (draft PR #150), diff-scoped. Verdict: solid and mostly self-explanatory; merge-ready after the fixes below, none of which need engineering work.

## 1. Developer experience
- **Prerequisites are under-documented.** They include `psql` (setup-e2e.sh and the sweep's `$sql:` at collection time, which fails with a raw ENOENT without it), `python3`, `openssl`, `curl`, free ports 4200–4205/4211/4212, and Docker memory for two stacks.
- **The documented `npm run setup:e2e -- --reset` fails on its own.** It dies at the `PASTORAL_ENCRYPTION_KEY` check after the slow resets, because the key only exists in `node_modules/.cache` (created by `e2e-local.sh`).
- `status_value` swallows stderr, so a failed stack reads as "not local".
- The control-plane `curl -s -o /dev/null` calls ignore failures.
- **Parity:** docs say 4 workers, config says 3. Local runs never `--reset`.
- **Safety:** `docs/testing.md` blessed running against an existing dev server, but the guard can't see that server's env.

## 2. Maintenance
- Adding a page is one manifest entry, well designed.
- `INLINE_DENIAL`/`KNOWN_BUGS` path keys live in the spec and go stale silently.
- `envGated` is documented but never read; `redirectsTo` is undocumented.
- **Server-action exports aren't enforced**: a new export in an existing module passes with no manifest change.
- `counts`/`generated_at` will cause merge conflicts on every parallel branch; derive them instead.
- CI rebuilds `next build` in all 4 shards; build once and pass `.next` as an artifact.

## 3. Flakiness
- The local retry is fine since it's reported as flaky, but **CI `retries: 2` masks intermittent gate bugs**. Use `failOnFlakyTests` or a flaky summary.
- `networkidle` hangs on pages that poll.
- An auth-exhaustion bounce reads as "stayed on X".
- A new pastoral key after `node_modules` is deleted silently double-encrypts local seed data.
- The last test (`page-role-sweep.spec.ts:246`) is a no-op.

## 4. Process text
- The wording is consistent across the 12 files.
- **Contradictions:**
  - `AGENTS.md` says "blocking", but the required checks need an admin step.
  - The Documenter runs "before a PR is opened", yet must confirm e2e is green, which only runs on a PR. It needs a draft-PR note.
- **Missing** from the `.claude/agents` builder/reviewer files: frontend-builder, backend-builder, test-verifier, implementation-validator, pr-reviewer.
- `improve-software.md:199` says `npm run test` runs Playwright.
- It is unclear what "changes a server action" requires.

## 5. Top 3
1. The two-step setup breaks the documented flow. Check the key first, store it in a gitignored repo-root file, and document the prerequisites.
2. Enforce export drift and derive `counts`.
3. Tone down "blocking", add the draft-PR note, and add the rule to the 5 agent files; fix the worker mismatch and `envGated`.
