# ADR 0017 — Multi-Tenant Sandbox Onboarding and Demo Simulation

**Status:** Accepted  
**Date:** 2026-06-21  
**Authors:** Engineering  

---

## Context
To achieve a full Phase D `GO` for Competitive Readiness, church administrators must be able to complete the onboarding flow without developer coaching. Testing these flows with empty tables makes evaluation difficult, while polluting production tables with mock data violates our security separation policies.

---

## Decision
Create a dedicated "Sandbox Mode" configuration flag for test tenants. If enabled, the client shell displays a guided onboarding tour and pre-hydrates temporary, isolated mock records (members, events, financial entries) for the tenant.

### Architecture Rules:
1. **Mock Scope:** Hydration occurs only in the target sandbox database environment—never bleeding into the production tenant partition.
2. **Setup Wizard:** An overlay guide prompts the user through standard tasks (approving account requests, checking children rosters).

---

## Consequences
* Simplifies evaluator flow testing.
* Sandboxed records are excluded from aggregate platform analytics.
* Requires a schema column `is_sandbox boolean` in `public.churches`.
