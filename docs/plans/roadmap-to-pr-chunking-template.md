# Roadmap-to-PR Chunking Template (Portable Process Plan)

**Status:** Draft for discussion. Not adopted. Nothing in this document is wired into `AGENTS.md`, CI, or any skill yet — see "Adoption mechanism" for what would need to change to make that true, and "Open decisions" for what's still unresolved.

**Purpose:** Define a repeatable process for turning a living plan document (`DEVELOPMENT_PLAN.md` in this repo, or its equivalent elsewhere) into grouped, reviewable GitHub PRs via issues and a Project board — instead of either (a) one PR per tiny plan item, or (b) large undifferentiated branches that make council review hard. This document is written to be copyable into other repos (ChurchShield, ChurchCore LMS, ChurchCore Academy, Book Forge, etc.) with only the bracketed placeholders changed.

**Relationship to existing docs (this repo):** `docs/plans/github-repository-operations.md` already specifies the GitHub-side scaffolding this process depends on — milestones, a Project with `Status`/`Sprint`/`Workstream`/`Risk`/`Plan Section` fields, issue forms, PR template fields. That document is a one-time setup checklist. This document is the *ongoing loop* that runs once that scaffolding exists: how items get decomposed, grouped into chunks, branched, gated, and reconciled as the plan evolves. Treat the two as setup vs. operation, not as competing plans.

---

## 1. The loop

Five steps, run repeatedly — not a one-time import.

### Step 1 — Decompose

Every addressable item in the plan document becomes a GitHub issue.

- Each issue body includes a `Plan section:` line pointing back to the exact heading/anchor in the plan doc (bidirectional traceability — plan → issue via this line, issue → plan via the issue's own link if the plan doc keeps a backlog table).
- Items that are too vague to scope into an issue stay in the plan doc as narrative until someone scopes them — decomposition doesn't force premature specificity.
- Security/privacy/payments/child-safety items use the `security-privacy-review` issue form (already defined in `github-repository-operations.md` Phase 2) so sensitive-data impact is never silently dropped when an item gets chunked later.

### Step 2 — Group into chunks

Issues are grouped via the Project's `Chunk` field (or reuse the existing `Sprint`/`Workstream` fields if a chunk maps cleanly to one of those — don't invent a redundant field when an existing one already carries the grouping).

Grouping criteria, in priority order:
1. **Shared surface** — issues that touch the same schema/module/route family group together (e.g., "recurring giving: schema + API + UI + tests" as one chunk, not four).
2. **Size cap** — a chunk should stay small enough for one council round to review meaningfully. No hard number here (that's an open decision below), but the working signal is: if a council agent would need to skim rather than read, the chunk is too big.
3. **Independent shippability** — a chunk should be mergeable to `main` on its own without leaving the app in a half-wired state. If two issues can't ship independently, they belong in the same chunk even if criterion 1 would otherwise split them.

Grouping is a proposal, not an automatic action: list the candidate chunk (its issues, its size, its rationale) and get a yes/no before a branch is cut. A tidy-looking Project view is not sufficient evidence the grouping is coherent — see "Risks" below.

### Step 3 — Branch per chunk

One feature branch per approved chunk. The branch closes every issue in the chunk (`Closes #a, #b, #c` in the PR body), not a subset.

### Step 4 — Gate (unchanged)

The chunk-level PR goes through the same Council + Documenter process already mandated in `AGENTS.md` for non-trivial merges. Chunking changes the *unit* under review, not whether review happens. The PR description references the council synthesis doc under `docs/reviews/`, same as today.

### Step 5 — Sync back

Whenever the plan document changes meaningfully, re-run Step 1 as a **diff**, not a fresh import:
- New plan items → new issues.
- Plan items removed or descoped → corresponding open issues closed with a reason, not silently abandoned.
- Plan items whose scope changed → existing issue body updated, `Plan section:` line re-checked.

This step is the one most likely to silently lapse. It needs an explicit trigger (a checklist line in whatever process edits the plan doc, or a periodic review cadence) rather than "remember to do it" — see Adoption mechanism.

---

## 2. Supporting GitHub scaffolding this loop assumes

The loop in Section 1 assumes some GitHub-side structure exists. ChurchCore's version is fully specified in `docs/plans/github-repository-operations.md`; the pieces of it that are generic — not ChurchCore-specific — are folded in here so a repo copying this template without that companion doc still has enough to work from. Repo-specific naming (actual milestone/sprint titles, the `ricardojjulia/ChurchCore` slug, exact label sets) is **not** portable — only the shape is.

**Issue intake.** Every issue type (bug, feature, security/privacy review, architecture decision) should carry:
- A **Plan section** field — this is the field Step 1's traceability depends on; without it the loop has no anchor back to the plan doc.
- A **sensitive-data impact** field (security/privacy/payments/child-safety or whatever category fits the domain), even on a plain feature-request template — Step 1 leans on this to route sensitive items to whatever heavier review process the target repo has.
- A **documentation impact** field, since Step 4's gate needs to know up front whether docs are expected to move.

**PR template.** Should require: which plan section/issue(s) this closes (mechanically backs the Step 3 "closes every issue in the chunk" rule instead of relying on the author to remember), which surface changed and whether it touches sensitive data, and what validation ran. Exact validation commands are repo-specific; the requirement that a PR states them is portable.

**Branch protection.** This is the one piece of the whole scheme that's actually mechanically enforceable by GitHub itself today, as opposed to the AGENTS.md mandate described in Section 3 below, which is honor-system until a skill checks it. At minimum: require PR before merge, require CI checks, block force-push, block deletion, enforce for admins too. It doesn't enforce chunk-grouping or issue-linkage specifically — GitHub has no native check for that — but it's the backstop that keeps "no direct push to main" from being optional.

**Labels.** A small type/surface/risk/status set (mirroring ChurchCore's `type:`/`surface:`/`risk:`/`status:` pattern) makes Step 2's "shared surface" grouping criterion queryable instead of tribal knowledge. Keep it small — an unchecked label taxonomy becomes its own maintenance burden.

**Explicitly not folded in.** Dependabot grouping, release-drafting conventions, and CODEOWNERS specifics are useful (see `github-repository-operations.md` Phases 3 and 5) but are orthogonal to the loop itself — a repo can run decompose→group→branch→gate→sync without them. Adopt them separately, per repo, on their own timeline.

---

## 3. Adoption mechanism (proposed, not implemented)

GitHub does not enforce issue-linkage or chunk-grouping on its own — there is no branch-protection rule for "this PR must close an issue in an approved Project chunk." Making this "without exception" real would require two things, neither built yet:

1. **A mandate line in `AGENTS.md`**, same register as the existing Council line ("This is a mandate, not a suggestion"): non-trivial plan work must exist as a tracked issue in the Project before a branch is opened, and the PR must reference the issue(s) it closes.
2. **A skill that checks it**, mirroring the `council`/`feature-factory` pattern already mirrored across `.claude/skills/`, `.codex/skills/`, `.gemini/skills/` in this repo. A written mandate with no automated check tends to get followed inconsistently; a skill step that a PR-opening workflow actually calls is checkable.

Both are deliberately **not done** in this pass — this document only specifies what they'd say.

### Exception clause

Reuse the same "non-trivial" bar the Council mandate already defines (the small-isolated-fix exception in `improve-software.md` §0), rather than defining a second bar. A change small enough to skip Council is also small enough to skip issue/chunk tracking. Two mandates with two different size thresholds is its own failure mode.

---

## 4. Portability — how to copy this template into another repo

1. Copy this file into `docs/plans/` (or that repo's equivalent) unchanged except for:
   - The plan-document name (`DEVELOPMENT_PLAN.md` → that repo's roadmap doc, if named differently).
   - Any reference to `github-repository-operations.md` — either point to that repo's own GitHub-ops setup doc, or note that one doesn't exist yet and Section 2's scaffolding (Plan-section issue field, PR template, branch protection, labels) needs to be created first.
2. Before assuming greenfield, check what's already there — an existing repo may already have partial issue templates, a PR template, or branch protection configured. Section 2 is a checklist to complete, not a from-scratch build in every repo.
3. Do **not** copy the Adoption mechanism section's specifics verbatim if that repo's `AGENTS.md` phrases its Council-equivalent mandate differently — match the existing mandate's wording style in that repo rather than importing ChurchCore's phrasing.
4. Decide separately (see below) whether that repo gets its own GitHub Project or joins a shared org-level Project spanning multiple repos. This template's loop works either way — Step 2's grouping just adds a `Repo` filter when the Project is shared.

---

## 5. Open decisions (deferred — "we will decide later")

- **Project scope**: one GitHub Project per repo, or one org-level Project spanning ChurchCore/LMS/Academy/ChurchShield with a `Repo` field. These repos look like one product family, which leans toward shared — but that's a real tradeoff (single roadmap view vs. per-repo noise) not yet decided.
- **Chunk size cap**: no numeric bound defined yet (issue count, file count, or LOC estimate). Needs a number before Step 2 stops being purely subjective.
- **Sync-back trigger**: manual (a person remembers to re-run Step 1 after editing the plan doc) vs. a lightweight CI/skill check that flags plan-doc diffs with no corresponding issue changes. Manual is cheaper to start; CI is the only way Step 5 doesn't quietly lapse after a few months.
- **Where the mandate line actually lands in `AGENTS.md`**, and whether it needs its own skill or can be folded into an existing one (`feature-factory` already runs before non-trivial feature work — it could own Step 1–2 as an entry check rather than a new skill owning it).
- **Sequencing**: whether Section 2's scaffolding gets built before the first chunk is attempted, or alongside it. Step 1's traceability has no anchor until the Plan-section field exists somewhere issues can carry it, so scaffolding realistically comes first.

---

## 6. Risks carried over from discussion

- **Grouping that looks coherent on the Project board but isn't in the diff.** The same failure mode already logged in memory for council synthesis (an agent's own summary sounding right while the details disagree) applies here: a chunk's issue list can look tidy while the actual PR bundles unrelated changes. The chunk's issue list must be reviewable as a plain list before a branch is cut, not trusted because the board view looks organized.
- **Ceremony creep.** Applying full decompose→group→gate ceremony to genuinely small, self-contained changes recreates the exact problem the Council mandate's small-isolated-fix exception already exists to avoid. The exception clause above exists specifically to prevent this document from becoming a second, uncoordinated bar.
