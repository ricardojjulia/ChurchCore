# Council Review 32 — Synthesis (S6: server-side broadcast recipients, F6)

**Branch:** `fix/broadcast-recipients-server-s6` (`bbc34e2`) vs `main`. Diff-scoped, four distinct read-only agents (`2026-10-01-council-review-32-agents-1-4.md`).

## Verdict

**S6 meets its definition of done.** `broadcastMessageAction` takes only ids and reads contacts on the server, scoped to the sender's church, contactable and unmerged.

**The round's main finding is outside the diff:** the communications hub component is orphaned. Its hand-picked broadcast and its whole suppressions screen render nowhere.

## Wrong or overstated claims (4)

1. A1: the merged-column split was called "CRITICAL"; both columns are set together.
2. A1: "broadcast skips suppressions."
3. A3: "could message someone who opted out."
4. A4: "F1 open"; it was done in Review 17.

A4 also called S11 "ready".

## Proposed (owner decision)

| # | Finding | Proposal |
|---|---|---|
| 1 | The orphaned `communications-hub.tsx` is dead code; its gating and picker are untested by real use. | Delete the component (and its test). Keep the hardened `broadcastMessageAction` for a future "message selected people" in compose. |
| 2 | No suppressions screen in the live app; S11 can't land as written. | **Widen S11 to a suppressions page** under `/app/communications`: list with reasons in words, church-admin add (already `suppressContactAction`), and remove (audited, with a reason). +0.5 day (S11 → 1 day). |
| 3 | Compose can only target segments, not individuals. | Should row (post-MVP unless pulled in): "message selected people" in compose, reusing `broadcastMessageAction`. |
| 4 | Merged-profile check spelled two ways. | Fold into S14's sweep (Should). |

## Readiness

Holds at **77/100**.
