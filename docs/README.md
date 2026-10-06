# Documentation Hub

The categorized index of everything in `docs/`. Start with the root [README](../README.md) for what ChurchCore is and the [HOWTO](../HOWTO.md) to run it. [`DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) is the source of truth for scope and open work.

---

## 🚀 Start Here

| Document | Purpose |
| :--- | :--- |
| [../HOWTO.md](../HOWTO.md) | Local setup, environment variables, tests, scripts, troubleshooting |
| [roadmap.md](roadmap.md) | Milestones to the November 6, 2026 MVP and what comes after |
| [architecture.md](architecture.md) | Architecture entry point: control plane, tenant data plane, providers |
| [application-guide.md](application-guide.md) | End-to-end product walkthrough and operator guide |
| [application-surface.md](application-surface.md) | Route map and per-feature implementation notes (moved from the README) |
| [setup/demo-install.md](setup/demo-install.md) | Hosted demo credentials and a guided tour |

---

## 🏗️ Architecture & Security

| Document | Purpose |
| :--- | :--- |
| [architecture.md](architecture.md) | Concise architecture overview with diagrams and links |
| [control-plane.md](control-plane.md) | The `/control` platform surface for ChurchCore staff |
| [tenant-data-segmentation.md](tenant-data-segmentation.md) | `church_id` tenancy and Row-Level Security |
| [cloud-architecture.md](cloud-architecture.md) | Recommended production cloud topology, regions and hosting costs |
| [auth-foundation.md](auth-foundation.md) | Auth and session foundation |
| [security-assessment.md](security-assessment.md) | Security and privacy assessment for sensitive church data |
| [security-mitigation-plan.md](security-mitigation-plan.md) | Security mitigation plan |
| [security-role-access-matrix.md](security-role-access-matrix.md) | Sensitive routes and actions by role, linked to executable evidence |
| [diagrams.md](diagrams.md) | Mermaid architecture, role, workflow and documentation diagrams |
| [development-plan-visual.md](development-plan-visual.md) | Visual companion to the development plan |

---

## 📜 Architecture Decision Records

| ADR | Decision |
| :--- | :--- |
| [0001](adr/0001-backend-and-data-platform.md) | Backend and Data Platform |
| [0002](adr/0002-control-plane-and-tenant-separation.md) | Control Plane and Tenant Separation |
| [0003](adr/0003-financial-management-module.md) | Financial Management Module: Double-Entry Accounting |
| [0004](adr/0004-competitive-readiness-architecture.md) | Competitive Readiness Architecture |
| [0005](adr/0005-member-mobile-checkin-policy-and-location-verification.md) | Member Mobile Check-In Policy And Location Verification |
| [0006](adr/0006-email-provider-resend.md) | Email Provider Resend |
| [0007](adr/0007-calendar-view-overhaul.md) | Calendar View Overhaul |
| [0008](adr/0008-anthropic-sdk-ai-ministry.md) | Anthropic SDK for AI Ministry Tools |
| [0009](adr/0009-localization-governance.md) | Localization Governance (CC-L10N-001) |
| [0010](adr/0010-project-hq-governance-architecture.md) | Project HQ Governance Architecture, Role-Based RLS Helper, and PII-Scrubbed AI Proxy |
| [0011](adr/0011-immutability-controls-and-read-audit-logging.md) | Immutability Controls, Consent Compliance, and Read-Audit Logging |
| [0012](adr/0012-audit-log-retention-and-pruning.md) | Audit Log Retention Policy and Pruning Schedule |
| [0013](adr/0013-diagnostic-query-timeout-and-caching.md) | Diagnostic Query Timeout and Caching Policy |
| [0014](adr/0014-persistent-ai-attribution-and-print-styles.md) | Persistent AI Attribution and Print Styles |
| [0015](adr/0015-schema-view-verification-and-recipient-resolver-alignment.md) | Schema View Verification, Communications Query Alignment, and Burnout Audit Logging |
| [0016](adr/0016-volunteer-sessional-followup-and-confirmation-architecture.md) | Volunteer Sessional Follow-up and Confirmation Architecture |
| [0017](adr/0017-sandbox-onboarding-simulation.md) | Multi-Tenant Sandbox Onboarding and Demo Simulation |
| [0018](adr/0018-import-adapter-hardening.md) | Incumbent Import Schema Mapping and Hardening |
| [0019](adr/0019-burnout-vitality-scoring.md) | Volunteer Burnout Analytics and Ministry Vitality Scoring |
| [0020](adr/0020-custom-reporting-ledger-export.md) | Custom Dashboard Report Builder and General Ledger Exports |
| [0021](adr/0021-tenant-erasure-audit-hardening.md) | Tenant Erasure & Control-Plane Audit Hardening |
| [0022](adr/0022-communications-compliance-lookups-admin-client.md) | Communications Compliance Lookups and Audit Writes Use the Admin Client |
| [0023](adr/0023-volunteer-shift-wall-clock-times.md) | Volunteer Shift Times Are Church Wall-Clock; "Today" Is the Church's Today |
| [0024](adr/0024-security-definer-actor-from-auth-uid.md) | A `SECURITY DEFINER` Function Takes Its Actor from `auth.uid()`, Never an Argument |
| [0025](adr/0025-stripe-connect-standard-direct-charges.md) | Online Payments Run on Each Church's Own Stripe Account (Connect Standard, Direct Charges) |
| [0026](adr/0026-churchcore-design-system-parity.md) | ChurchCore design system parity, through the theme |
| [0027](adr/0027-openrouter-ai-gateway.md) | OpenRouter AI gateway |

---

## 🛠️ Setup & Operations

| Document | Purpose |
| :--- | :--- |
| [setup/local-supabase.md](setup/local-supabase.md) | Local Supabase setup, seed, reset and smoke tests |
| [setup/dev-startup-troubleshooting.md](setup/dev-startup-troubleshooting.md) | Fast triage for `npm run dev` startup failures |
| [setup/production-deployment.md](setup/production-deployment.md) | Production deployment and environment variables |
| [setup/demo-deploy.md](setup/demo-deploy.md) | Demo environment deployment |
| [setup/demo-install.md](setup/demo-install.md) | Demo guide for church staff and evaluators |
| [setup/hosted-shepherdai-rollout.md](setup/hosted-shepherdai-rollout.md) | Hosted ShepherdAI rollout runbook |
| [setup/observability.md](setup/observability.md) | Observability setup |
| [setup/private-repo-launch-checklist.md](setup/private-repo-launch-checklist.md) | GitHub-side hardening after the first push |
| [runbooks/communications.md](runbooks/communications.md) | Communications operations runbook |
| [todo.md](todo.md) | Remaining Supabase project hookup steps |

---

## 🧪 Testing & Quality

| Document | Purpose |
| :--- | :--- |
| [testing.md](testing.md) | The surface-coverage manifest, the e2e suite and CI |
| [testing-schema.md](testing-schema.md) | Route, action and domain coverage map |
| [mvp-readiness-audit.md](mvp-readiness-audit.md) | MVP verdict, verification gaps and readiness queue |
| [production-readiness-roadmap.md](production-readiness-roadmap.md) | Production readiness roadmap |
| [prompts/ai-council-of-testers-v6.md](prompts/ai-council-of-testers-v6.md) | Testing Council v6 (Omni-Council) protocol |
| [prompts/ai-council-of-testers-v5.md](prompts/ai-council-of-testers-v5.md) | Testing Council v5 (superseded by v6) |

---

## 📦 Product & Features

| Document | Purpose |
| :--- | :--- |
| [product-strategy.md](product-strategy.md) | Product strategy |
| [mvp-competitive-analysis.md](mvp-competitive-analysis.md) | MVP status, competitive positioning, pricing and moat |
| [church-admin-workspace.md](church-admin-workspace.md) | ChurchAdmin operations, accounts and event management |
| [church-admin-people.md](church-admin-people.md) | ChurchAdmin people management |
| [portal-foundation.md](portal-foundation.md) | Member and public portal foundation |
| [pastoral-care-foundation.md](pastoral-care-foundation.md) | Pastoral notes and care assignments |
| [shepherd-ai-ops.md](shepherd-ai-ops.md) | ShepherdAI architecture and guardrails |
| [advanced-ministry-forge-research-spec.md](advanced-ministry-forge-research-spec.md) | Specialized ministry tracks, stewardship metrics and confidentiality |
| [sprint2-attendance-identity-flow.md](sprint2-attendance-identity-flow.md) | Sprint 2 attendance, roster and member identity |
| [churchgoer-pastor-execution-plan.md](churchgoer-pastor-execution-plan.md) | Churchgoer and pastor data execution sequence |
| [working-calendar.md](working-calendar.md) | Working calendar |
| [UI-UPDATES.md](UI-UPDATES.md) | Earlier UI direction (colour now governed by [ADR 0026](adr/0026-churchcore-design-system-parity.md)) |

---

## 🗺️ Plans & Roadmaps

| Document | Purpose |
| :--- | :--- |
| [../DEVELOPMENT_PLAN.md](../DEVELOPMENT_PLAN.md) | Source of truth; §0 is the MVP tracker |
| [roadmap.md](roadmap.md) | Short milestone summary pointing into §0 |
| [plans/2026-09-25-mvp-competitive-status-report.md](plans/2026-09-25-mvp-competitive-status-report.md) | MVP and competitive status report (2026-09-25) |
| [plans/competitive-readiness-roadmap.md](plans/competitive-readiness-roadmap.md) | Competitive readiness roadmap |
| [plans/competitive-readiness-30-day-execution.md](plans/competitive-readiness-30-day-execution.md) | 30-day competitive readiness execution |
| [plans/mvp-competitive-go-no-go-checklist.md](plans/mvp-competitive-go-no-go-checklist.md) | Go/no-go gates |
| [plans/member-mobile-pwa-foundation-audit.md](plans/member-mobile-pwa-foundation-audit.md) | Member mobile PWA baseline audit |
| [plans/ministry-spec.md](plans/ministry-spec.md) | Ministry specification and Ministry Forge doc index |
| [plans/advanced-ministry-elders-pastor.md](plans/advanced-ministry-elders-pastor.md) | Advanced ministries, elders and pastor council |
| [plans/churchgoer-data.md](plans/churchgoer-data.md) | Churchgoer data and self-service portal |
| [plans/reporting-implementation.md](plans/reporting-implementation.md) | Reporting-suite implementation plan |
| [plans/spanish-ui-coverage.md](plans/spanish-ui-coverage.md) | Spanish UI coverage |
| [plans/ui-stack-migration.md](plans/ui-stack-migration.md) | UI stack migration plan |
| [plans/github-repository-operations.md](plans/github-repository-operations.md) | GitHub repository operations |
| [plans/roadmap-to-pr-chunking-template.md](plans/roadmap-to-pr-chunking-template.md) | Portable roadmap-to-PR chunking template |
| Weekly execution briefs | [06-05](plans/2026-06-05-execution-brief.md) · [06-12](plans/2026-06-12-execution-brief.md) · [06-19](plans/2026-06-19-execution-brief.md) · [06-26](plans/2026-06-26-execution-brief.md) · [07-03](plans/2026-07-03-execution-brief.md) · [07-10](plans/2026-07-10-execution-brief.md) |
| [superpowers/specs/2026-06-11-demo-feedback-hardening-design.md](superpowers/specs/2026-06-11-demo-feedback-hardening-design.md) | Demo feedback hardening design |
| [superpowers/plans/2026-06-11-demo-feedback-hardening.md](superpowers/plans/2026-06-11-demo-feedback-hardening.md) | Demo feedback hardening implementation plan |

---

## 🏛️ Governance & Software Factory

| Document | Purpose |
| :--- | :--- |
| [../AGENTS.md](../AGENTS.md) | Repository rules for every agent and contributor |
| [../improve-software.md](../improve-software.md) | The Council protocol (v2) and Documenter close-out |
| [software-factory.md](software-factory.md) | Claude Code, Codex and Gemini factory workflows |
| [council-and-hq-portable.md](council-and-hq-portable.md) | Portable spec for the Council and Project HQ |
| [reviews/](reviews/) | Council review reports and syntheses |
| [factory-runs/](factory-runs/) | Durable records of meaningful factory runs |
| [prompts/replicate-project-hq.md](prompts/replicate-project-hq.md) | Prompt: build Project HQ in any codebase |
| [prompts/replicate-demo-feedback-system.md](prompts/replicate-demo-feedback-system.md) | Prompt: replicate the demo feedback and error-triage system |

---

## 🤝 Buyer-Facing

| Document | Purpose |
| :--- | :--- |
| [buyer/competitive-overview.md](buyer/competitive-overview.md) | Competitive overview |
| [buyer/security-privacy-story.md](buyer/security-privacy-story.md) | Security and privacy story |

---

## 🖼️ Diagrams & Assets

- [assets/diagrams/](assets/diagrams/) — SVG companions for [diagrams.md](diagrams.md) and [development-plan-visual.md](development-plan-visual.md) (system architecture, role/surface map, core workflows, documentation map, software factory, development plan).
- [assets/brand/hero-banner.svg](assets/brand/hero-banner.svg) — README hero banner (ChurchCore design system colours, no external fonts or images).

---

## Root Documents

[README](../README.md) · [HOWTO](../HOWTO.md) · [CONTRIBUTING](../CONTRIBUTING.md) · [SECURITY](../SECURITY.md) · [SUPPORT](../SUPPORT.md) · [VERSIONING](../VERSIONING.md) · [CODE_OF_CONDUCT](../CODE_OF_CONDUCT.md) · [RELEASE_CHECKLIST](../RELEASE_CHECKLIST.md) · [CHANGELOG](../CHANGELOG.md) · [LICENSE](../LICENSE)
