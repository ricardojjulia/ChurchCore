# ADR 0013: Diagnostic Query Timeout and Caching Policy

* **Status:** Proposed  
* **Date:** 2026-06-21  
* **Authors:** Antigravity (Gemini Software Factory)  
* **Decisions:** [2026-06-21-council-review-5-synthesis.md](file:///Users/rjulia/ChurchCore/docs/reviews/2026-06-21-council-review-5-synthesis.md)  

---

## Context and Problem Statement

The platform diagnostic route `/api/control/db-health` queries `pg_stat_activity` to determine active database connections and states. Under high platform concurrency or during database connection exhaustion:
1. Standard client queries to postgres can hang or block indefinitely until reaching default system TCP timeouts.
2. An administrative user checking the health of the connection pool can inadvertently worsen the connection pool lock count if their diagnostics queries wait in queue.

To prevent cascading connection failures, diagnostics must be non-blocking and have low overhead.

---

## Decision Drivers

* **Cascading Fail-Safe (Resilience)**: Diagnostic tools must not consume resource slots when the system is already failing.
* **Low Overhead**: Avoid overloading the system during admin status polling.
* **Accuracy vs. Performance**: Small latencies (up to 10 seconds) in active connection counts are acceptable for administrative metrics.

---

## Proposed Decisions

### 1. Statement Timeout Constraint
Force a query statement timeout parameter (`SET local statement_timeout = 2000;` or connection timeout settings) specifically for the database connections count diagnostics calls. Any diagnostic request exceeding 2 seconds will be aborted immediately.

### 2. In-Memory Caching
Cache the queried connection statistics array in memory inside the Next.js API route context. Subsequent diagnostic requests within **10 seconds** of a successful query will retrieve cached values instead of querying the tenant database.

---

## Consequences

* **Positive**:
  - Eliminates the risk of diagnostic queries blocking connection pool slots.
  - Mitigates read loads on tenant databases during intensive platform monitoring.
* **Negative**:
  - Platform administrators will see connection metrics that can be up to 10 seconds stale.
