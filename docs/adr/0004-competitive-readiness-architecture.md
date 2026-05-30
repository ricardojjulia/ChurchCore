# ADR 0004: Competitive Readiness Architecture

- Status: Accepted
- Date: 2026-05-25
- Deciders: Ricardo Julia

## Context

ChurchCore has a broad product surface across people, households, ministries, events, children's ministry, volunteers, giving, finance, communications, reporting, and ShepherdAI workflow recommendations. The product strategy now requires the platform to compete credibly with mature church-management systems such as Planning Center, Breeze/Tithely, Pushpay/CCB, Realm, and MinistryPlatform.

The largest competitive risk is not lack of module count. It is whether the workflows are complete, discoverable, mobile-usable, provider-backed, importable, and verifiably secure.

The next major release will therefore focus on six competitive-readiness priorities:

1. Finish the ChurchAdmin weekly operator path.
2. Harden mobile member workflows.
3. Complete real communications delivery.
4. Close service planning and event registration gaps.
5. Add migration and import tooling.
6. Prove security, privacy, and role-access claims with executable checks.

This architecture decision governs how those priorities will be implemented.

## Decision

ChurchCore will treat competitive readiness as a release architecture, not only as a feature backlog. Each priority must follow the existing control-plane and tenant separation from ADR 0002 and the financial correctness rules from ADR 0003.

The release architecture has six building blocks:

1. **Readiness contracts for operator workflows**
   - Each major ChurchAdmin module exposes a summary of blocking issues, warnings, completion state, route targets, and recommended actions.
   - The weekly readiness workspace composes these summaries instead of duplicating module logic.

2. **Mobile-first member surface**
   - Member self-service workflows live under `/app/member/*` and are treated as phone-sized workflows first.
   - Member writes are narrow, church-scoped, and use pending-review records where updates require staff approval.

3. **Provider-adapter communications**
   - Email and SMS are sent only through server-side communication services and provider adapters.
   - Consent, unsubscribe, suppression, idempotency, delivery events, and audit logging are enforced before provider calls are made.

4. **Service planning and registration as first-class tenant workflows**
   - Service plans are modeled separately from general events while linking to calendar events where useful.
   - Event registration uses form definitions, normalized responses, capacity/waitlist rules, payment state where applicable, and roster views.

5. **Import staging before canonical writes**
   - CSV and vendor imports write first to staging records.
   - Vendor parsers are isolated from canonical tenant writes.
   - Church admins review dry-run results and explicitly commit imports before records affect live people, households, groups, giving, events, attendance, or finance data.

6. **Security proof as part of delivery**
   - Role-access matrices, RLS verification, sensitive-action tests, route smoke checks, and documentation evidence are required release artifacts.
   - Preview mode remains useful for evaluation, but authenticated local Supabase checks are required before security claims are made.

## Architectural Rules

- Competitive-readiness work must not weaken the control-plane and tenant boundary accepted in ADR 0002.
- New tenant workflows must declare their allowed roles, denied roles, tenant-scope behavior, and audit requirements before implementation.
- External providers must be integrated through adapter boundaries. SDK calls must not be scattered through pages, components, or unrelated server actions.
- Communications delivery must check consent and suppression state server-side before enqueueing or sending messages.
- Provider webhooks must be idempotent and store normalized delivery events separately from raw provider payloads.
- Imports must support dry-run validation before commit. No vendor import may write directly to canonical tenant tables.
- Import commits must be auditable by tenant, actor, source system, source file, timestamp, and row counts.
- Financial imports or paid event registrations must preserve integer-cent accounting and reconciliation rules from ADR 0003.
- Member self-service updates that affect sensitive canonical records must support pending-review state when staff approval is required.
- Every workflow that appears in the release roadmap must include empty, loading, unavailable-backend, insufficient-permission, validation-error, provider-error, and completion states where applicable.
- A workflow is not release-complete until tests, docs, and role-access evidence are updated.

## Consequences

- Competitive readiness becomes more than a UI cleanup pass. It requires shared contracts, provider boundaries, import staging, and verification infrastructure.
- Some features will take longer because direct writes and direct provider calls are rejected in favor of auditable orchestration.
- The roadmap can be implemented incrementally because each phase has explicit acceptance criteria and documentation gates.
- Import tooling will be safer but more complex because staging, validation, duplicate detection, dry runs, commits, and audit logs are required.
- Communications delivery will be easier to extend later because provider-specific code is contained behind adapters.
- Security claims become testable release artifacts instead of marketing language.

## Alternatives Considered

### Treat each competitive priority as an isolated feature backlog

This would allow faster individual feature starts, but it would encourage duplicate readiness logic, inconsistent role handling, direct provider calls, and import paths that are hard to audit. Rejected because it does not support the compliance-first product position.

### Create separate ADRs for every subsystem immediately

This would maximize governance, but it would front-load decisions before implementation exposes enough detail. Rejected for now. Additional ADRs may be added later for communications provider selection, import staging schema, service planning data model, or notification architecture if tradeoffs become substantial.

### Keep imports as one-off CSV tools

This would be simpler for early demos, but it would not support real migration evaluation from Planning Center, Breeze/Tithely, Pushpay/CCB, and other incumbent systems. Rejected because migration confidence is a competitive requirement.

### Rely on manual QA for role and security proof

Manual QA remains useful, but it cannot substantiate strong claims around tenant isolation, child safety data, finance, communications consent, pastoral records, and imports. Rejected because the product strategy depends on security-native credibility.

## Follow-On Work

1. Implement the roadmap in [Competitive Readiness Roadmap](../plans/competitive-readiness-roadmap.md).
2. Add or update module docs as each phase ships.
3. Extend `docs/testing-schema.md` with role-access, RLS, smoke, and provider-webhook coverage.
4. Add provider-specific ADRs only when provider choice or data model tradeoffs require durable decisions.
5. Keep `README.md`, `CHANGELOG.md`, and `docs/application-guide.md` current as release phases land.
