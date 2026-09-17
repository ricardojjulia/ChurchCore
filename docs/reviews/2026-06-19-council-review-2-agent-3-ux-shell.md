# Council Agent 3: UX & Login Security Audit — ChurchCore LMS

**Date:** 2026-06-19
**Auditor:** Agent 3 — UX & Shell Security
**Status:** Complete

---

## 1. Login State & Active Nav UX

* **Visual Session Feedback**: The sidebar navigations in `ApplicationShell` show the current authenticated profile details (name, email, role, avatar, and active focus) dynamically.
* **Layout Isolation**: Sidebar options are conditionalized based on the verified role (`portalRole`), ensuring that links to private views (like `/hq`) are hidden from unqualified roles (members).
* **Skeleton Transition Hardening**: The loading state check on `/hq` is now visually guarded using Mantine `Skeleton` blocks, avoiding sudden visual layout shifts or blank screens during role lookup.

---

## 2. Session Lifecycle & Timeout Behavior

* **Next.js Session Verification**: Session authentication checks happen server-side on initial page fetches, routing expired user tokens to `/sign-in` gracefully.
* **Supabase Client Cookie Handshake**: User authentication cookies are kept secure. However, client-side session states are managed in-memory via Next.js routes.
* **Gaps in Inactivity Expiry**: The client application does not monitor user inactivity. If an admin leaves `/hq` open in a browser tab, there is no client-side hook that automatically locks the screen or destroys the session cookie after a configured window of idle time, creating an physical-device security gap.

---

## 3. Error Boundary and Leak Risks

* **Server Action Error Interception**: Database queries inside Server Actions are wrapped in `try/catch` blocks. Specific exceptions (e.g. unique constraint conflicts) are masked before returning payloads to the client.
* **Development Error Warnings**: Decryption attempts on pastoral notes or sensitive fields log warnings in development when keys are missing:
  `[ChurchCore] WARNING: PASTORAL_ENCRYPTION_KEY is not set.`
  However, production environments enforce a strict throw-behavior, preventing unencrypted rendering.
* **Error Boundary Deficiencies**: The `app/error.tsx` file catches general runtime compilation errors, but nested directories lack modular boundaries. A database connection timeout on a sub-route could trigger a full-screen application crash instead of localized warnings.

---

## 4. Top 3 UX & Shell Security Gaps for MVP

1. **Client-Side Inactivity Lock**: Implement an idle-timeout listener on client pages to force redirect to `/sign-in` after 15 minutes of inactivity.
2. **Localized Error Boundaries**: Add specific `error.tsx` layouts in `/app/church-admin/` and `/app/pastor/` to isolate database exceptions.
3. **Logout Destructor**: Ensure the logout button explicitly invokes a server action that invalidates the cookie and revokes the Supabase auth session.
