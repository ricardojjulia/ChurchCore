# ADR 0018 — Incumbent Import Schema Mapping and Hardening

**Status:** Accepted  
**Date:** 2026-06-21  
**Authors:** Engineering  

---

## Context
Incumbent platforms (Planning Center, Breeze) generate CSV exports with varying header keys. Hardcoded import columns cause import failures for evaluators, and large imports risk database connection timeout or duplicate database inserts.

---

## Decision
Implement a stateful, interactive header mapping interface. Instead of enforcing static headers, allow administrators to map their CSV columns dynamically to the application profile fields (e.g. `Mobile` or `Celular` mapped to `phone`).

### Safety Requirements:
1. **Dynamic Mapping Schema:** Client-defined column overrides are parsed by PapaParse.
2. **Duplicate Prevention:** Query the database for matches against email and external identifiers (`source_id`) before running database commits.
3. **Execution Guard:** Hard-limit uploads to 5MB and dry-run rows to 100 rows per transaction batch.

---

## Consequences
* Highly tolerant migration adapters.
* Minimizes connection footprint by isolating transactions.
