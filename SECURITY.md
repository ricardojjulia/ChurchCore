# Security Policy

ChurchCore handles sensitive church workflows: child-safety operations, giving and finance, member and household data, pastoral care, and role-restricted administrative actions. Treat security reports seriously and keep disclosure private.

## Supported Versions

Security fixes are applied to the latest `main` branch and released in the next version.

| Version | Supported |
| :--- | :--- |
| `main` | Yes |
| `3.5.x` | Yes |
| Older releases | No |

---

## Security Boundaries & Core Invariants

1. **Row-Level Security and `church_id` tenancy**
   - Every tenant table carries `church_id`, and PostgreSQL RLS is enabled in the same migration that creates it. Policies compose from `is_platform_admin()`, `belongs_to_church()` and `can_manage_church()`, which read `auth.uid()` ([tenant-data-segmentation.md](docs/tenant-data-segmentation.md)).
   - `npm run audit:rls` runs in CI against a freshly reset database and fails the build if a `church_id` table lacks RLS. Never rely on application-level filtering alone.
2. **Control-plane separation** ([ADR 0002](docs/adr/0002-control-plane-and-tenant-separation.md))
   - Platform data (tenant registry, staff, support audit) lives in a separate control-plane Supabase project behind `/control`; church runtime data lives in the tenant data plane behind `/app`. Entering a church's view from the control plane is explicit and audited.
3. **`SECURITY DEFINER` actor rule** ([ADR 0024](docs/adr/0024-security-definer-actor-from-auth-uid.md))
   - A `SECURITY DEFINER` function takes its actor from `auth.uid()`, never from an argument.
4. **`server-only` vs. `"use server"`** ([ADR 0022](docs/adr/0022-communications-compliance-lookups-admin-client.md))
   - A module whose exports take a trusted session or tenant id is `import "server-only"`. Only a module whose exports authenticate their own caller may be `"use server"`, because every `"use server"` export is a POST-callable endpoint.
5. **Webhooks, crons and stubs fail closed**
   - `/api/webhooks/{stripe,resend,sendgrid,twilio}` reject every request when their secret is unset and verify the provider's signature (SendGrid's ECDSA and Twilio's HMAC-SHA1 schemes, as the providers publish them). `/api/cron/*` require `CRON_SECRET` on any built deploy. Provider stubs may report success only outside production or with `NEXT_PUBLIC_DEMO_MODE=true` (`lib/stub-mode.ts`).
6. **Payments** ([ADR 0025](docs/adr/0025-stripe-connect-standard-direct-charges.md))
   - Each church's money moves on its own connected Stripe account (`Stripe-Account` on every call); ChurchCore never holds church funds.
7. **AI gateway** ([ADR 0027](docs/adr/0027-openrouter-ai-gateway.md))
   - Every LLM call goes through one server-only gateway (`lib/ai/gateway.ts`) to OpenRouter with zero-data-retention routing that fails closed, and PII scrubbing on every message (`lib/ai/scrub.ts`).
8. **Pastoral encryption**
   - `pastoral_notes.content` and `care_assignments.summary` are encrypted at rest with AES-256-GCM (`lib/crypto/pastoral.ts`, `PASTORAL_ENCRYPTION_KEY`, required in production — see [production-deployment.md](docs/setup/production-deployment.md)).
9. **Secrets**
   - `SUPABASE_SERVICE_ROLE_KEY`, provider keys and webhook secrets are server-only and must never reach client bundles or logs. Only `NEXT_PUBLIC_*` variables are exposed to the browser.

Role-by-route evidence is maintained in [docs/security-role-access-matrix.md](docs/security-role-access-matrix.md).

---

## Reporting a Vulnerability

**Do not disclose suspected vulnerabilities in public GitHub issues, discussions or pull requests.**

Report privately through GitHub's **Private Vulnerability Reporting** (the repository's **Security** tab → *Report a vulnerability*). If that is unavailable, contact the repository owner listed in [`.github/CODEOWNERS`](.github/CODEOWNERS) through the private channel already used for project coordination.

Please include:

- The affected area: route, server action, API route, webhook, migration or RLS policy.
- Step-by-step reproduction, or a proof of concept.
- The impact: which roles or tenants can do what they shouldn't.
- Any mitigation you have already verified.

Never include real church, member, child or donor data in a report. Maintainers will acknowledge receipt, validate severity, and prepare a fix before any public disclosure.

### Scope priorities

Please prioritize reports involving:

- authentication or session handling
- privilege escalation or broken role boundaries
- cross-tenant access (one church reading or writing another church's data)
- exposure of member, family, pastoral or child-safety data
- finance, donation or ledger tampering
- webhook or cron endpoints that accept unauthenticated input
- unsafe local bootstrap or secret-handling paths
- AI or communication features that bypass consent, suppression or audit expectations

---

## Repository Baseline

This repository runs:

- **CI** (`.github/workflows/ci.yml`): `verify` (surface manifest, lint, typecheck, build, unit tests, RLS audit, database tests) and four `e2e` shards — required status checks on `main`.
- **CodeQL** analysis (`codeql.yml`), on pushes and pull requests to `main` and weekly.
- **Dependency review** on pull requests (`dependency-review.yml`).
- **Secret scanning** with gitleaks (`secret-scan.yml`).
- **Verified commit signatures** required on `main`.

Enable GitHub secret scanning, push protection, code scanning, Dependabot alerts and dependency graph support in the repository settings; see [docs/setup/private-repo-launch-checklist.md](docs/setup/private-repo-launch-checklist.md).

## Ownership Metadata

Review ownership is assigned through [`.github/CODEOWNERS`](.github/CODEOWNERS). Update it if the repository moves from a single-owner setup to a team-owned workflow.
