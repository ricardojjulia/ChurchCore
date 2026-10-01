# Council Review 33 — Synthesis (S10: public event registration, server-side)

**Branch:** `fix/public-registration-server-s10` (`47e6e8d`) vs `main`. Diff-scoped, four distinct read-only agents (`2026-10-02-council-review-33-agents-1-4.md`).

## Verdict

**S10 meets its definition of done, and with it the Week 2 safety track (M2) is complete.**
- No public inserts into `event_registrations`.
- The visitor page reads and the action writes on the server.
- Visibility, deadline, capacity, the waitlist and custom fields are enforced.

**A schema sweep found no other unconditional write policy.**

Found while reviewing: a required checkbox could be submitted unchecked. Fixed on this branch.

## Wrong or overstated claims (7)

- A2: the church list "via the admin client"; the admin client "respects" RLS; "27 tests".
- A4: S6 "pending"; Gap 1 closed "Oct 2"; S11 called a Should row; the rate limit "prevents" spam.

## Proposed (owner decision)

| # | Finding | Proposal |
|---|---|---|
| 1 | Any member can read every registration payment in their church; no member screen needs it. | Migration on this branch: limit members to payments for their own registrations. |
| 2 | `account_requests` allows direct anon inserts beside its validating RPC. | Migration on this branch: drop the anon insert policy; the RPC stays the only way in. |
| 3 | Checkbox fields are Buttons; event times show in the browser's zone, unlabeled. | Fix on this branch: real checkboxes, and times in the church's time zone with its name. |
| 4 | The public registration page and panel are English-only. | Add to S13 (translation). |
| 5 | Capacity race; a per-instance rate limiter. | Note under S14; revisit before scale. |

## Readiness

Holds at **77/100**. The safety track closes, but no competitive gap moves.
