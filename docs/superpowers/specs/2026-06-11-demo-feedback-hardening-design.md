# Demo Feedback Hardening Design

## Goal

Harden ChurchCore's demo feedback system so submitted identity, deduplication,
session timing, validation, and rate limiting are server-authoritative while
preserving the control-plane data boundary. Provide a reusable AI prompt that
can reproduce the complete system in another codebase.

## Current Behavior

The hosted demo exposes a floating feedback button and automatically captures
React errors. Reports are sent to `POST /api/demo/feedback`, deduplicated by a
browser-generated fingerprint, and stored in the control-plane `demo_feedback`
table. Platform staff triage reports at `/control/demo-feedback`.

The current implementation has four gaps:

1. Browser payloads always send `user_email` and `user_role` as `null`.
2. Manual reports on the same route and category share a fingerprint even when
   their notes describe unrelated issues.
3. Session duration is collected by the button but is not validated or stored.
4. Rate limiting is process-local and therefore inconsistent across serverless
   instances.

## Architecture

### Server-authoritative identity

The API will call `getSession(route)` and derive identity only from the returned
authenticated session. Browser-provided identity fields will be ignored.
Anonymous users remain anonymous. Stored identity is limited to the authenticated
profile email and role identifier already exposed in the application session.

### Server-authoritative fingerprint

A shared server-safe utility will normalize fingerprint inputs and compute a
SHA-256 hash:

- automatic errors: route + category + normalized error message
- manual reports: route + category + normalized note

Whitespace is collapsed, surrounding whitespace is removed, and text is
lowercased before hashing. This keeps repeat reports together while preventing
unrelated manual notes from collapsing into one issue. The API ignores any
client-provided fingerprint.

### Session duration

The client continues calculating elapsed demo-session seconds. The API accepts
only finite, non-negative integers and caps values at 30 days. The value is
stored as `session_duration_seconds`. Automatic error reports include the same
duration field.

### Atomic database rate limiting

The control-plane database will own the submission window. A
`demo_feedback_rate_limits` table stores a hashed session key, window start, and
request count. A server-only database function atomically:

1. obtains an advisory transaction lock for the session key,
2. resets expired windows,
3. rejects requests above 20 submissions per 60 seconds,
4. upserts accepted feedback and increments duplicate hit counts.

The service-role API is the only caller. The function uses invoker rights and
browser roles receive no execution or limiter-table access. Old limiter rows can
be removed opportunistically by the function.

### Validation and privacy

The API validates:

- UUID session ID
- route length from 1 to 500 characters
- allowed category
- optional error message up to 4,000 characters
- optional note up to 2,000 characters
- breadcrumbs as at most five strings, each at most 500 characters
- demo version up to 100 characters
- session duration as a bounded integer

The API passes normalized values to the database RPC. It returns generic failure
messages and does not expose database errors. Feedback remains in the
control-plane database and platform-admin RLS remains unchanged.

## Data Model

Add to `demo_feedback`:

- `session_duration_seconds integer`

Add `demo_feedback_rate_limits`:

- `session_key_hash text primary key`
- `window_started_at timestamptz`
- `request_count integer`
- `updated_at timestamptz`

Replace `upsert_demo_feedback` with `submit_demo_feedback`, which returns a
boolean indicating whether the request was accepted. Duplicate reports update
the latest context, increment `hit_count`, reopen triage, and retain the original
`created_at`.

## Client Changes

The feedback button and error boundary will send contextual fields but no
fingerprint or user identity. Both include `session_duration`. The UI behavior
and demo-mode gating remain unchanged.

## Review Workspace

The server data type and detail drawer will expose session duration. Existing
filters, triage actions, and processed-state behavior remain unchanged.

## Reusable AI Prompt

`docs/prompts/replicate-demo-feedback-system.md` will be self-contained and
stack-adaptable. It will require the target agent to inspect its codebase,
preserve security boundaries, implement schema/API/client/admin review layers,
use tests first, update documentation, and report verification evidence.

## Acceptance Criteria

1. Authenticated reports store server-derived email and role.
2. Anonymous reports store no identity.
3. Client-provided identity and fingerprint values are ignored.
4. Manual reports with materially different notes receive different fingerprints.
5. Equivalent normalized notes and errors deduplicate.
6. Session duration is validated, sent by both capture paths, stored, and shown.
7. The database atomically enforces 20 submissions per session per 60 seconds.
8. Duplicate submissions increment hit count and reopen processed reports.
9. The system remains completely inactive when demo mode is disabled.
10. Focused tests, lint, and production build pass.

## Residual Risk

Session IDs are browser-generated and can be rotated by a determined abusive
client. This change provides reliable distributed per-session throttling, not a
full bot-defense system. IP-based controls are intentionally excluded to avoid
retaining additional network identifiers and because the demo feedback endpoint
is low-impact and service-role mediated.
