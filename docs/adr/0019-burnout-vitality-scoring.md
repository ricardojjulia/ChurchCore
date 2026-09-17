# ADR 0019 — Volunteer Burnout Analytics and Ministry Vitality Scoring

**Status:** Accepted  
**Date:** 2026-06-21  
**Authors:** Engineering  

---

## Context
High volunteer turnover is a major issue in church operations. The system needs to prevent schedule creators from overloading members without complicating the scheduling UI.

---

## Decision
Introduce a backend validation routine checking rolling 30-day schedules.
* **Burnout Condition:** If a profile is assigned to >3 shifts in a month or >2 consecutive weeks, flag a warning banner.
* **Vitality Scoring:** Calculate an overall *Ministry Vitality Index* (0-100) aggregating volunteer rest ratios and small group attendance rates.

### Audit Guardrail:
Every scheduler override acknowledging a warning status is captured inside `logAuditEvent` with record ID references.

---

## Consequences
* Protects volunteer health via operational metrics.
* Ensures changes and bypass decisions are auditable.
