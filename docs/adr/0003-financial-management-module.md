# ADR 0003 — Financial Management Module: Double-Entry Accounting

**Date**: 2026-04-16  
**Status**: Accepted  
**Deciders**: Ricardo Julia

## Context

ChurchForge's existing giving/donations module handles Stripe-backed member contributions. Churches also need internal bookkeeping: tracking expenses, categorizing income beyond donations, managing restricted/unrestricted funds, producing income statements and balance sheets, and satisfying 501(c)(3) reporting requirements. A budget-only tool would not satisfy these needs.

## Decision

We will implement a full double-entry accounting module (`finance_accounts`, `finance_journals`, `finance_journal_lines`, `finance_budgets`, `finance_budget_lines`, `finance_imports`) using integer cents storage (`amount_cents`) consistent with the existing `donations` table. Journal lines enforce balanced debits and credits at the application layer. The module is restricted to the church-admin role.

We will add two new npm dependencies:
- **`xlsx`** (Apache-2.0) — for Excel `.xlsx` import parsing. Well-supported, zero native dependencies, runs in Node and browser environments.
- **`papaparse`** (MIT) — for robust CSV parsing with streaming support, header detection, and type coercion. Avoids brittle hand-rolled CSV logic.

OFX/QFX bank feed import will be handled with a small hand-rolled parser (no additional dependency needed — OFX is structured text parseable with simple regex/string operations).

## Alternatives Considered

- **Budget + expense tracker only**: Simpler to build, but insufficient for fund accounting, restricted-fund tracking, and audit readiness. Would require a breaking schema migration later.
- **Integrate a third-party accounting API (QuickBooks Online, Xero)**: Adds an external subscription dependency per tenant, creates significant data-boundary concerns, and couples ChurchForge to a third-party's availability and pricing. Not appropriate for the current stage.
- **Use a float/decimal type for amounts**: Rejected in favor of `integer` cents to match the existing `donations` table and avoid floating-point rounding errors in financial calculations.

## Consequences

- Double-entry schema is more complex than a simple expense table, but enables correct financial reporting from day one.
- `xlsx` adds ~1.5 MB to the server bundle; this is acceptable for a server-side import parser and can be lazy-loaded.
- The `finance_accounts.parent_id` self-reference supports hierarchical chart of accounts (e.g., 5000 Expenses → 5100 Salaries) without requiring a separate tree table.
