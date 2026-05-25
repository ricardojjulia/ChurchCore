# ChurchCore Ops Diagrams

These diagrams are the canonical visual reference for the repository. The Mermaid blocks are the source of truth because GitHub renders them natively and they stay easy to review in pull requests.

Static SVG companions live in `docs/assets/diagrams/` for contexts where Mermaid rendering is unavailable.

For the visual companion to the development plan, see [docs/development-plan-visual.md](development-plan-visual.md).

## System Architecture

![ChurchCore Ops system architecture](assets/diagrams/system-architecture.svg)

```mermaid
flowchart LR
  contributor[Contributor or Evaluator] --> github[GitHub Repository]
  github --> ci[GitHub Actions CI]
  github --> vercel[Vercel Next.js App]

  vercel --> public[Public Entry and Portal]
  vercel --> tenant[Tenant App: /app]
  vercel --> control[Control Plane: /control]
  vercel --> cron[ShepherdAI Cron]

  public --> tenant
  tenant --> tenantDb[(Tenant Supabase Project)]
  control --> controlDb[(Control Plane Supabase Project)]
  cron --> tenantDb

  tenantDb --> tenantData[Church-scoped members, ministries, events, giving, care, workflows]
  controlDb --> platformData[Tenants, billing metadata, platform staff, audit trail]

  classDef repo fill:#101828,stroke:#475467,color:#ffffff
  classDef app fill:#e0f2fe,stroke:#0284c7,color:#0c4a6e
  classDef data fill:#ecfdf3,stroke:#16a34a,color:#14532d
  classDef guard fill:#fff7ed,stroke:#ea580c,color:#7c2d12

  class github,ci repo
  class vercel,public,tenant,control,cron app
  class tenantDb,controlDb,tenantData,platformData data
  class contributor guard
```

## Role And Surface Map

![ChurchCore Ops role and surface map](assets/diagrams/role-surface-map.svg)

```mermaid
flowchart TB
  super[SuperAdmin] --> control[/Control Plane/]
  platform[ChurchCore Ops Staff] --> control

  churchAdmin[ChurchAdmin] --> admin[/Church Admin Workspace/]
  secretary[Secretary / Office Admin] --> daily[/Daily Desk/]
  pastor[Pastor / Elder] --> pastorDesk[/Pastor Views/]
  leader[Ministry Leader] --> ministry[/Ministry Forge/]
  member[Member / Volunteer] --> memberPortal[/Member Portal/]
  visitor[Visitor or Prospect] --> publicPortal[/Public Portal/]

  control --> controlDb[(Control Plane DB)]
  admin --> tenantDb[(Tenant DB)]
  daily --> tenantDb
  pastorDesk --> tenantDb
  ministry --> tenantDb
  memberPortal --> tenantDb
  publicPortal --> tenantDb

  tenantDb --> guardrails[RBAC, RLS, consent, audit logs]
  controlDb --> guardrails
```

## Core Workflow Map

![ChurchCore Ops core workflow map](assets/diagrams/core-workflows.svg)

```mermaid
flowchart LR
  intake[Public portal request] --> review[ChurchAdmin account review]
  review --> invite[Tenant auth invitation]
  invite --> profile[Church-scoped profile hydration]
  profile --> member[Member portal]

  member --> giving[Giving and receipts]
  member --> calendar[Calendar RSVP]
  member --> preferences[Consent and communication preferences]

  admin[ChurchAdmin dashboard] --> people[People and households]
  admin --> ministries[Ministry Forge]
  admin --> events[Events and volunteers]
  admin --> finance[Giving ops and finance]
  admin --> readiness[Weekly readiness]

  shepherd[ShepherdAI scheduled evaluation] --> signals[Deterministic ministry signals]
  signals --> suggestions[Suggested workflows]
  suggestions --> queue[ChurchAdmin workflow queue]
  queue --> actions[Assign, defer, dismiss, complete]
```

## Documentation Map

![ChurchCore Ops documentation map](assets/diagrams/documentation-map.svg)

```mermaid
flowchart TB
  readme[README.md] --> plan[DEVELOPMENT_PLAN.md]
  readme --> visualPlan[docs/development-plan-visual.md]
  readme --> diagrams[docs/diagrams.md]
  readme --> guide[docs/application-guide.md]
  readme --> setup[docs/setup/local-supabase.md]
  readme --> security[docs/security-assessment.md]

  plan --> adr1[ADR 0001: Backend and Data Platform]
  plan --> adr2[ADR 0002: Control Plane and Tenant Separation]
  plan --> adr3[ADR 0003: Financial Management]

  guide --> product[Product walkthrough]
  setup --> local[Local evaluator path]
  diagrams --> svg[Static SVG companions]
  visualPlan --> strategy[Strategy, roadmap, security, Sprint 1 diagrams]
```
