# Council Review 22 — Agent 3: UX & Shell

**Scope:** `fix/member-writes-rls-s8` at `4377e49` vs `main` (S8). Read-only.

## 1. Error strings a member can see

**New and clean** (plain, no internals): the donation strings ("Enter a gift amount between $0.01 and $100,000.", "Couldn't start your gift. Please try again.", "Couldn't start the payment. Please try again.", "Your payment hasn't completed yet.", "That gift isn't yours to cancel.", "Your recurring gift was stopped, but we couldn't update your records. Please contact the church office."); group join (`groups-actions.ts:234,235,243`); check-in insert (`member-actions.ts:458`, "Couldn't check you in. Please try again or see a volunteer."); data rights ("Couldn't save your request. Please try again.", "Couldn't find your profile to update.").

**Raw Supabase `error.message` still reaches members** in functions the diff touched: `member-actions.ts:368` (`gateError`), `:404` (`profileError`), `:441` (`existingError`) in mobile check-in, and `:821` on the `event_registrations` insert. The last still uses the RLS-bound client with `.select("id").single()`, so a household-member registration probably returns "new row violates row-level security policy" (inferred). Client `catch` blocks show `err.message` (`data-rights-panel.tsx:52,80,100,120`, `donor-portal.tsx:121`); production throws are redacted to Next's digest text, which is confusing but doesn't leak.

## 2. Double-submit and pending feedback

Every submit uses `useTransition` plus Mantine `loading={isPending}`, so double-submit is blocked (verified). In `member-groups-browser.tsx:113` all Join buttons share one `isPending` (cosmetic). The "Requested" badge is local state and disappears on reload (a second click is harmless but misleading).

## 3. Giving with Stripe configured

The copy "Online card giving isn't available yet. Your gift was not charged…" is honest; the flow around it isn't:

- Before the member sees it, `initiateDonationAction` has inserted a `pending` row and created a real Stripe Customer and PaymentIntent. **Every attempt leaves a permanent "pending" gift** in the member's history (`donor-portal.tsx:269-270` shows the raw lowercase status with a yellow dot). The history loader (`lib/donations-data.ts:106-111`) doesn't filter by status. Totals correctly count only succeeded gifts. (Verified.)
- No warning before submit: the member fills in the form and only then finds out.
- **Stub mode isn't limited to dev.** `retrievePaymentIntentStatus` returns "succeeded" whenever `STRIPE_SECRET_KEY` is missing (`lib/stripe/donations.ts:126`). A deployed church with no Stripe keys would record gifts as succeeded and email receipts for money never received. Before this change the row stayed pending. (Verified.)

## 4. i18n

Every new string is hardcoded English, but the whole member donor portal, data-rights panel, groups browser, check-in card and registration panel were already untranslated, so the diff matches its surroundings. The admin giving dashboard is translated (`lib/i18n.ts:1152+`). Dates and currency are fixed to `en-US` (`donor-portal.tsx:41,48`).

## 5. Accessibility

Mantine notifications and `Alert` render with `role="alert"`, so errors are announced. Success toasts are also announced assertively — acceptable.

## 6. Top 3 member-facing issues

1. **Receipts for gifts never made when Stripe keys are missing in a deployment.** `lib/stripe/donations.ts:126` + `donor-portal.tsx:96-104`. The title says "(dev mode)" but nothing checks the environment. Verified.
2. **A permanent "pending" gift, plus an orphaned PaymentIntent, for every attempt with Stripe configured.** Fix: return before inserting or calling Stripe while G3.0 is unbuilt, and show the notice up front. Verified.
3. **Household registration and check-in errors can show raw Postgres/RLS text.** `member-actions.ts:821` (and `:368/404/441`). Code path verified; the household RLS rejection is inferred.

Minor: Join state lost on reload; the $100k limit is only checked on the server (the NumberInput has no `max`).
