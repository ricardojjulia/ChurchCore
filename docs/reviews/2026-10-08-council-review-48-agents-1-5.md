# Council Review 48: agent reports (G2.2 kiosk self check-in)

This was a diff-scoped round on `feat/kiosk-self-checkin-g2-2` (`a534b5b`, `780b6d6`, `16d90d3`) against `main`. Five separate read-only agents each received their verbatim `improve-software.md` prompt plus a scope preamble. Their reports are condensed below. The synthesis checks every claim against source and lists the ones that were wrong.

## Agent 1: Data and API

**Confirmed:**
- The two new tables have RLS and are used.
- The column revoke is safe; no `families` select-star exists.
- Tenant erasure covers the new tables.
- The seed is realistic.
- Rollback is stated.
- Duplicate check-ins are race-safe through 23505.

**Found:**
- Medium: staff check-ins lose their audit actor, because the service-role write leaves `auth.uid()` null in the trigger.
- Low: `serviceId` is trusted from the browser.
- Low: the household token isn't cleared after check-in.
- Low: the rate limit isn't atomic.
- Low: kiosk sessions are never pruned.
- Low: phone lookup ignores `families.home_phone`.
- Medium: whether hosted has duplicate active check-ins was UNVERIFIED. The orchestrator had already verified 0.

## Agent 2: Routes and pages

No nav 404s and no orphaned actions. All 9 exports are in the manifest.

**Medium-High:** the kiosk proxy passes `/api/*`, so admin-gated APIs (people CSV, giving PDFs, Stripe onboarding) are reachable from the tablet.

**Low:**
- A static-asset regex bypasses `.json` and `.txt` paths.
- `/kiosk` itself returns 404.
- Residual risk: server actions can be called by ID through devtools.

## Agent 3: UX and shell

**Medium:** an Exit dialog opened on the start screen never times out, leaving the password and its visibility toggle on screen.

**Low:**
- No language picker for families.
- Focus goes to the heading, not the input.
- A single room isn't preselected.
- No `/kiosk` `error.tsx`.
- The Start button has no pending state.
- ARIA:
  - nested alertdialog;
  - assertive per-second countdown;
  - `aria-label` on a `<p>`;
  - "selected" announced twice.

## Agent 4: Feature and plan

G2.2 meets its definition of done; Gap 2 closes on merge.

**Real gaps:**
- Checkout safety (T2): no custody or pickup check, an unchecked error, a non-constant-time QR comparison.
- Rooms ignore age and capacity.
- Only one open service at a time.
- No labels.
- No visitor path.

**Readiness:** 93 on merge.

**Wrong:**
- O13 open.
- "T3".
- G1.7/G1.8 as Must.
- A Teacher role.

## Agent 5: Security

Authorization, tenant isolation and RLS pass. No SECURITY DEFINER functions, and no PII in audit entries.

**HIGH:**
- Releasing or expiring the kiosk lands in a live admin session.
- `/api` is open behind the admin session.

**MEDIUM:**
- The admin's real password is typed on the tablet.
- The PIN stays on screen for 70 s.

**LOW-MEDIUM:** members can write `families.checkin_code`.

**Low:**
- The household token isn't cleared.
- The rate-limit race.
- Lookup responses include profile UUIDs.
