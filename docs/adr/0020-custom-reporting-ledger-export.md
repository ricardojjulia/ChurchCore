# ADR 0020 — Custom Dashboard Report Builder and General Ledger Exports

**Status:** Accepted  
**Date:** 2026-06-21  
**Authors:** Engineering  

---

## Context
Administrators require customizable report outputs across giving and membership logs to synchronize with external auditing tools and church boards. 

---

## Decision
Build a tenant-isolated JSON query engine allowing dynamic column selection and filters.
* **RLS Boundaries:** The API route checks authentication sessions and forces a `church_id = session.church_id` predicate on all queries.
* **Audit Tracking:** Log all export actions to the audit records with parameters mapped (excluding actual financial values).

---

## Consequences
* Flexible, user-defined reporting.
* Enforces tenant-isolation boundary security at the API router layer.
