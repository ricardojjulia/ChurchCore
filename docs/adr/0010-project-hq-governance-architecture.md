# ADR 0010: Project HQ Governance Architecture, Role-Based RLS Helper, and PII-Scrubbed AI Proxy

* **Status:** Accepted
* **Date:** 2026-06-18
* **Authors:** Antigravity (Gemini Software Factory)
* **Decisions:** [20260713000000_hq.sql](file:///Users/rjulia/ChurchCore/supabase/migrations/20260713000000_hq.sql), [route.ts](file:///Users/rjulia/ChurchCore/app/api/ai/route.ts), [page.tsx](file:///Users/rjulia/ChurchCore/app/hq/page.tsx)

---

## Context and Problem Statement

For administrative and management users, ChurchCore LMS requires a high-level project governance dashboard at `/hq` to track tasks, risks, and decisions. This dashboard must interact with an AI advisor (Anthropic Claude) using institutional records. The requirements impose three critical security and performance constraints:
1. **Data Security**: Row Level Security (RLS) must be active on all governance tables.
2. **Access Control**: Authorization rules must utilize a secure helper function `public.current_user_role()` instead of direct recursive profiles queries (which cause performance bottlenecks).
3. **Data Privacy (PII)**: User emails and database identifiers (UUIDs) must be scrubbed server-side before sending prompt strings to external AI models.

---

## Decision Drivers

* **Compliance**: Enforce strict data boundaries between public members, leaders, and platform administrators.
* **Performance**: Avoid recursive joins on profiles tables when verifying permissions during database transactions.
* **API Key Safety**: Keep `ANTHROPIC_API_KEY` server-side only; never expose it to client-side bundles.

---

## Proposed Decisions

### 1. Database Role Mapping Helper (`public.current_user_role()`)
We define `public.current_user_role()` as a `SECURITY DEFINER` function with `SET search_path = public` to bypass row restrictions safely and calculate the active user's permissions once:
* Platform Admins and Profile `role = 'church_admin'` resolve to `'admin'`.
* Profiles matching `'pastor_elder'`, `'secretary'`, or `'ministry_leader'` resolve to `'manager'`.
* Profiles assigned as a `'lead_teacher'` in CCM volunteer registers resolve to `'teacher'`.
* All other profile entries or anonymous sessions resolve to `'member'`.

### 2. High-Level Governance Tables with RLS
Create `hq_sessions`, `hq_tasks`, `hq_risks`, and `hq_decisions`. Establish strict RLS policies:
* **SELECT**: Authorized for `'admin'`, `'manager'`, and `'teacher'`.
* **INSERT/UPDATE**: Restricted to `'admin'` and `'manager'`.
* **DELETE**: Restricted exclusively to `'admin'`.
* **Private Sessions**: Users can only see/modify their own AI sessions (`hq_sessions`).

### 3. Server-Side AI Proxy Route Handler
Create a server route `/api/ai`. The client sends prompts to the proxy; the server validates the Supabase session, scrubs input strings of email patterns and UUID structures, and makes a server-to-server call to the Anthropic Node SDK. The resulting interaction is logged to `hq_sessions` and returned to the client.

---

## Consequences

* **Positive**:
  * Unified, clean permission mapping.
  * Direct table RLS prevents client-side leaks or unauthorized database updates.
  * PII is scrubbed before leaving the server.
* **Negative**:
  * Any user role changes require recalculating active Supabase context.
  * The AI advisor is blind to specific database record identifiers during conversations, preventing direct record link bindings.
