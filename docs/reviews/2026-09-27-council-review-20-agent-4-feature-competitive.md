# Council Review 20 — Agent 4: Feature & Competitive Audit

**Branch:** `feat/blockout-dates-g1-4`, diff-scoped to commit `e54a856`.

## 1. G1.4 definition of done
| Clause | Status |
|---|---|
| Volunteer self-service on `/app/member/schedule` | **Met, with a gap:** member role only |
| Admin entry in the directory | **Met** (church-checked) |
| The planner and assign modal honor blockouts | **Met** (Story 3's `isBlocked`), plus the new roster flag |
| Tests | **Met** |
| Extra | Blockouts by link for volunteers without a login; `vbd_own` tightened |

## 2. Public-link bugs (verified)
- The `events` columns are `starts_at`/`ends_at`, so every accept/decline link and every schedule link failed on Supabase.
- **Real reach was smaller:** tokens are created only by the manual reminder action (14-day expiry). Assigning creates no token.
- Review 19's 84% counted a response loop that didn't work, so it was really about 80–81%.
- **Leftover bug:** the Respond fallback `shift.confirmation_token ?? token` sends a sibling shift that was never reminded to the wrong shift's page.

## 3. vs. Planning Center Services blockouts
| Capability | ChurchCore |
|---|---|
| Dates and ranges with a reason | Match |
| Reason visible to admins | Partial: shown in the modal, not on the roster badge |
| Recurring blockouts | **Lacking** |
| Household blockouts | Lacking |
| Without a login / mobile | Partial: the link works; no native app |
| Team blockout calendar | Lacking |
| Warn when blocking a scheduled day | Match |

**Recommendation:**
- Make recurring blockouts a tracker row before MVP. It's small, because a pattern expands into day rows.
- Defer the team calendar and household blockouts.
- Fold the reason-on-badge into G1.5.

## 4. Effect on G1.5
- G1.5 must **create a token when a shift is assigned**, on both the manual and auto-fill paths. Its expiry should run to the shift date plus a buffer, not a fixed 14 days.
- That also removes the Respond fallback bug.
- The token now also grants blockout writes, so its expiry length is a small security question.

## 5. Scores
- Gap 1: about 87% (from about 85%).
- Volunteer Scheduling: re-based to about 81%, then **86%**.
- **MVP readiness: 71/100 (+1).**

## 6. Top findings
1. **(High)** The Respond fallback sends people to the wrong shift.
2. **(High)** Tokens exist only after a manual reminder. G1.5's definition of done should say "token on assign; expiry ≥ shift date".
3. **(Medium)** Only the member role can self-enter blockouts.
4. **(Medium, competitive)** Recurring blockouts.
5. **(Low)** The reason isn't shown on the roster, and there's no team-wide view.
