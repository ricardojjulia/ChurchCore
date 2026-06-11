# AI Prompt: Replicate the Demo Feedback and Error-Triage System

Use the following prompt with Codex or another coding agent inside the target
repository.

---

You are working in an existing software repository. Implement a complete,
production-quality demo feedback and error-triage system equivalent to the
functionality described below. Adapt it to the repository's existing framework,
database, authentication, component library, testing tools, and documentation
conventions. Do not introduce a parallel architecture when established patterns
already exist.

## Required Working Method

1. Read the repository's agent instructions, architecture documents, development
   plan, dependency manifest, authentication implementation, database migration
   conventions, and test configuration before proposing changes.
2. Locate existing patterns for:
   - global application providers and error boundaries,
   - authenticated server routes,
   - privileged database access,
   - row-level security or equivalent authorization,
   - staff/admin workspaces,
   - notifications/toasts,
   - migrations and focused tests.
3. Present a concise design covering architecture, data flow, privacy, access
   control, deduplication, rate limiting, error handling, and tests. Obtain
   approval if the repository's workflow requires it.
4. Use test-driven development. Add failing tests, verify the expected failures,
   implement the smallest coherent behavior, and rerun the tests.
5. Update the repository's README, changelog, relevant operational docs, and
   implementation/factory-run notes.
6. Run focused tests plus the repository's standard lint and production-build
   commands. Report exact results and residual risks.

## Functional Scope

### Feature gate

Add an environment-controlled demo mode. When disabled:

- the feedback button renders nothing,
- the demo session provider adds no listeners or storage activity,
- automatic error reporting sends no requests,
- the submission API returns a non-success response.

Do not rely only on a browser-visible environment variable. Enforce the gate on
the server endpoint too.

### Demo session context

Create a global demo session provider that:

- creates a random UUID in browser session storage,
- reuses it for the current browser tab/session,
- records session start time,
- tracks the five most recent application routes,
- exposes session ID, breadcrumbs, and elapsed duration in seconds,
- renders safely during server-side rendering without hydration mismatch.

### Manual feedback capture

Add a fixed-position, accessible feedback button available throughout the demo.
It opens a modal containing:

- required category:
  - `BUG`
  - `ERROR`
  - `UNEXPECTED_RESULT`
  - `IMPROVEMENT`
- optional note, maximum 2,000 characters,
- submitting/loading state,
- success and failure notifications.

The browser submits only contextual data:

- session ID,
- route,
- category,
- optional error message,
- optional note,
- recent route breadcrumbs,
- demo version,
- session duration.

The browser must not decide or submit trusted identity, authorization, or
fingerprint values.

### Automatic React/UI error capture

Add the framework-appropriate global error boundary. For React, use a class
error boundary where required by the framework. When an unhandled render error
is captured in demo mode:

- send a non-blocking feedback request with category `ERROR`,
- include the safe error message, current route, breadcrumbs, demo version, and
  session duration,
- swallow failures from this secondary reporting request,
- show a non-blocking notification that the error was captured,
- do not include stack traces, secrets, raw provider payloads, request headers,
  tokens, or sensitive application records unless explicitly approved.

The error boundary must not make the original application less stable.

## Server Submission Contract

Create one server endpoint for feedback submission.

### Validation

Validate and normalize:

- session ID: UUID,
- route: 1-500 characters,
- category: exact allowlist,
- error message: optional, maximum 4,000 characters,
- note: optional, maximum 2,000 characters,
- breadcrumbs: array of at most five strings, each at most 500 characters,
- demo version: maximum 100 characters,
- session duration: integer from 0 through 2,592,000 seconds.

Reject malformed JSON and incorrect field types. Return generic database failure
messages; do not expose internal errors to the client.

### Server-derived identity

Resolve the current authenticated session on the server:

- for authenticated users, store only the application profile email and role
  identifier needed by staff triage,
- for anonymous users, store `null` identity,
- ignore any browser-provided identity fields,
- do not use a service-role client to infer the current user.

### Server-derived fingerprint

Compute a SHA-256 fingerprint on the server. Normalize input by trimming,
lowercasing, and collapsing repeated whitespace.

- automatic errors: normalized route + category + normalized error message,
- manual reports: normalized route + category + normalized note.

Equivalent reports should deduplicate. Materially different manual notes on the
same route and category must remain separate. Ignore any client-provided
fingerprint.

### Distributed atomic rate limiting

Enforce 20 accepted submissions per session per 60-second window in shared
durable storage, not process memory. Prefer an atomic database function or an
existing distributed rate-limit service already used by the repository.

If using Postgres:

- hash the session ID before storing the limiter key,
- serialize updates for the same key with a transaction-level advisory lock or
  equivalent row-lock strategy,
- atomically reset expired windows, increment accepted requests, and reject the
  twenty-first request,
- opportunistically remove stale limiter rows,
- use invoker rights when the server/service role already has the required table
  privileges,
- expose the submission function only to the server/service role,
- drop obsolete privileged submission functions,
- if security-definer execution is unavoidable, place the function in a private
  schema and revoke browser/public execution.

Do not add IP retention unless the product owner explicitly approves it.

## Database Model

Create a feedback table or extend the existing equivalent with:

- UUID primary key,
- unique fingerprint,
- session ID,
- route,
- constrained category,
- optional error message,
- optional note,
- JSON breadcrumbs,
- optional user email,
- optional user role,
- demo version,
- nullable non-negative session duration seconds,
- hit count defaulting to 1,
- JSON metadata,
- processed boolean defaulting to false,
- nullable constrained action,
- created and updated timestamps.

Supported triage actions:

- `code_fixed`
- `update_applied`
- `suggestion_not_implemented`
- `suggestion_implemented`
- `bug_fixed`
- `error_fixed`
- `received_and_closed`

On fingerprint conflict:

- increment hit count atomically,
- update the latest contextual fields,
- retain the original creation timestamp,
- set `processed=false`,
- clear the prior action,
- update the timestamp.

Store this data in the platform/control-plane boundary rather than tenant
operational storage when the product has separate data planes.

Enable row-level security or equivalent controls:

- only platform staff/admins may read feedback,
- only platform staff/admins may update triage fields,
- normal browser roles cannot insert directly,
- the public submission API writes through a server-only privileged client.

Add indexes for route, category, session ID, and descending creation time.

## Staff Review Workspace

Add a protected platform-staff route that loads feedback from the control-plane
client and displays:

- open, done, and all views,
- category filter,
- email/role substring filter,
- from/to date filters,
- unprocessed items first, then newest,
- timestamp,
- user identity when available,
- route,
- category badge,
- note or error preview,
- duplicate hit count,
- current action,
- processed toggle.

Opening a row should show a drawer/detail panel with:

- submission timestamp,
- user and role,
- session duration,
- hit count,
- breadcrumbs,
- full note,
- safe error message,
- action selector,
- processed toggle,
- collapsed raw JSON for authorized diagnostic use.

Use optimistic updates for triage changes and roll back the local state when the
server update fails. Protect both the page and mutation endpoint with the
repository's platform-staff authorization helper.

## Required Tests

Add focused tests proving:

1. all demo components are inert when demo mode is disabled,
2. the button opens and submits the expected context,
3. automatic errors submit context and swallow reporting failures,
4. client identity and fingerprints are absent or ignored,
5. authenticated identity is derived on the server,
6. anonymous feedback stores no identity,
7. equivalent normalized reports share a fingerprint,
8. different manual notes produce different fingerprints,
9. every field bound and category allowlist is enforced,
10. session duration is sent, validated, stored, loaded, and displayed,
11. database/RPC rejection produces HTTP 429,
12. database errors produce a generic HTTP 500,
13. only platform staff can load and mutate triage records,
14. filters, empty state, detail drawer, action update, and processed update work,
15. duplicate submissions increment hit count and reopen processed records.

Where practical, add a migration-level or integration test for atomic rate-limit
behavior and duplicate upsert behavior.

## Delivery Requirements

- Do not add unusual dependencies without approval and an ADR.
- Preserve unrelated working-tree changes.
- Use a feature branch; do not push directly to the default branch.
- Include migration deployment order and environment variables in the handoff.
- Report files changed, behavior added, verification commands/results, and
  residual risks.
- Explicitly call out that browser-generated session IDs can be rotated and that
  per-session throttling is not complete bot protection.

---
