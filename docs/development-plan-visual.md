# ChurchCore Visual Development Plan

This is the visual companion to [DEVELOPMENT_PLAN.md](../DEVELOPMENT_PLAN.md). The written plan remains the source of truth for scope, stack, security posture, roadmap, and release discipline.

Static SVG companions live in `docs/assets/diagrams/` for contexts where Mermaid rendering is unavailable.

## Product Strategy Map

![ChurchCore product strategy map](assets/diagrams/development-plan-strategy.svg)

```mermaid
flowchart TB
  vision[ChurchCore: secure multi-tenant church operations] --> boundaries[Separated control plane and tenant app]
  vision --> roles[Role-based portals]
  vision --> stewardship[Ministry and operational stewardship]
  vision --> trust[Security, privacy, consent, and audit]
  vision --> ai[Assistive AI with theological guardrails]

  boundaries --> control[Control plane: platform staff, tenant lifecycle, billing metadata, support audit]
  boundaries --> tenant[Tenant app: church admins, pastors, secretaries, leaders, members]

  roles --> super[SuperAdmin]
  roles --> admin[ChurchAdmin]
  roles --> secretary[Secretary / Office Admin]
  roles --> pastor[Pastor / Elder]
  roles --> leader[MinistryAdmin / Leader]
  roles --> member[Volunteer / Member]

  stewardship --> members[Members, families, attendance]
  stewardship --> ministries[Ministry Forge and specialized pathways]
  stewardship --> calendar[Calendar, events, RSVP, volunteers]
  stewardship --> giving[Giving, finance, reports]
  stewardship --> comms[Email and SMS communications]

  trust --> pii[PII and PHI-adjacent care data]
  trust --> rls[RBAC and RLS]
  trust --> consent[Consent and user data rights]
  trust --> appsec[SAST, SCA, DAST, secrets, OWASP]

  ai --> sermon[Sermon planning]
  ai --> bible[Bible study]
  ai --> prayer[Prayer journals and send-outs]
  ai --> workflow[Ops-only workflow recommendations]
```

## Roadmap Flow

![ChurchCore sprint roadmap](assets/diagrams/development-plan-roadmap.svg)

```mermaid
flowchart LR
  s1[Sprint 1: Foundation and Member Portal] --> s2[Sprint 2: Admin Dashboard and Church Setup]
  s2 --> s3[Sprint 3: Events and Volunteer Management]
  s3 --> s4[Sprint 4: Donations, Reporting, Financial Management]
  s4 --> s5[Sprint 5: AI Ministry Tools Phase 1]
  s5 --> s6[Sprint 6: Communications and Polish]
  s6 --> s7[Sprint 7+: Advanced features, payment tiers, launch]

  s1 -. exit .-> e1[Signed-in user lands in church-scoped context]
  s2 -. goal .-> e2[Admin tools, church settings, directory]
  s3 -. goal .-> e3[Calendar, RSVPs, volunteer workflows]
  s4 -. goal .-> e4[Stripe, dashboards, accounting, budgets]
  s5 -. goal .-> e5[Sermon planner and Bible study assistant]
  s6 -. goal .-> e6[Notifications and responsive polish]
  s7 -. goal .-> e7[Production launch path]
```

## Boundary And Security Model

![ChurchCore boundary and security model](assets/diagrams/development-plan-security-model.svg)

```mermaid
flowchart TB
  platform[ChurchCore platform staff] --> control[Control plane]
  church[Church users] --> tenant[Tenant app]

  control --> controlDb[(Control-plane database)]
  tenant --> tenantDb[(Tenant database)]

  controlDb --> controlData[Tenant registry, billing metadata, platform staff, tenant-view audit]
  tenantDb --> tenantData[Profiles, ministries, events, giving, care, volunteers, workflows]

  tenantData --> sensitive[Sensitive data classes]
  sensitive --> pii[Member PII]
  sensitive --> giving[Donations and finance]
  sensitive --> pastoral[Pastoral notes and prayer journals]
  sensitive --> child[Children safety records]
  sensitive --> care[Volunteer feedback and care records]

  sensitive --> protections[Protections]
  protections --> minimization[Data minimization and masking]
  protections --> encryption[Encryption at rest and in transit]
  protections --> rls[RBAC and row-level security]
  protections --> consent[Consent and auditing]
  protections --> review[Manual review for PII, payment, or AI changes]
```

## Sprint 1 Execution Flow

![ChurchCore Sprint 1 execution flow](assets/diagrams/development-plan-sprint1.svg)

```mermaid
flowchart LR
  align[Align repo to approved frontend direction] --> freeze[Freeze shared data-plane drift]
  freeze --> boundary[Document control-plane versus tenant separation]
  boundary --> schema[Normalize tenant schema]
  schema --> profile[Hydrate church-scoped profiles after sign-in]
  profile --> portal[Build member portal on real tenant data]
  portal --> ministries[Build ministry assignment flows]
  ministries --> events[Replace preview calendar with categorized event records]

  schema --> tables[churches, profiles, ministries, profile_ministries, events]
  events --> exit[Exit: auth, profiles, ministries, events, RLS baseline]
```

## How To Use This Visual Plan

- Use [DEVELOPMENT_PLAN.md](../DEVELOPMENT_PLAN.md) for exact requirements, release discipline, and implementation constraints.
- Use this visual companion when orienting contributors, reviewers, or evaluators.
- Update this file whenever plan sections change enough that the strategy, roadmap, boundary model, or Sprint 1 flow would be misleading.
