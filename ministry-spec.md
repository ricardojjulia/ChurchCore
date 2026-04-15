# ChurchForge Ministry Specification

**Living Document** - Last Updated: April 14, 2026  
**Purpose**: This file is the repo-level master ministry specification for ChurchForge. It summarizes the approved Ministry Forge direction and points to the deeper engineering documents that govern implementation detail.

This specification should be read alongside:

- `DEVELOPMENT_PLAN.md`
- `advanced_ministry_elder_pastor.md`
- `docs/advanced-ministry-forge-research-spec.md`
- `docs/sprint2-attendance-identity-flow.md`

## Scope

ChurchForge ministry features are not limited to assignment tracking. The product direction is now explicitly centered on **Kingdom Stewardship** across:

- ministry participation
- leadership formation
- demographic-specific pathways
- service-oriented pathways
- deterministic health metrics
- assistive-only AI insights with theological guardrails

## Approved Ministry Pathways

ChurchForge should support distinct pathway intelligence for:

- `men`
- `women`
- `children`
- `youth`
- `young_adult`
- `marriage`
- `education`
- `missions`
- `outreach`

These pathways are separate from ordinary event attendance and separate from the current operational `ministries.ministry_type` classification.

Use this distinction:

- `ministries` represents concrete teams or ministries
- `profile_ministries` represents assignment to those concrete ministries
- `ministry_tracks` is the planned longitudinal model for track-based formation, leadership tenure, and lifecycle movement

## Ministry Goals By Track

### Children

- secured and age-graded classrooms
- safety-clearance visibility
- ratio monitoring and emergency escalation
- guardian-aware operational workflows

### Men

- mentorship-heavy discipleship structures
- lineage visibility for who is mentoring whom
- multiplication and fruitfulness tracking

### Women

- life-stage support circles
- study and care pairing
- interest-aware support matching

### Youth

- graduation and transition readiness
- next-step milestone tracking
- aging-out visibility into young-adult pathways

### Young Adults

- vocation and calling support
- industry-aware mentorship
- community and transition visibility

### Marriage

- mentor-couple cohorts
- pastoral theme visibility from aggregate signals
- strict confidentiality boundaries

### Education

- doctrinal curriculum progress
- certification or completion milestones
- theology coverage visibility

### Missions

- partner-linked participation
- impact, hours, and support reporting
- long-term outcome visibility

### Outreach

- local community care coverage
- follow-up visibility
- neighborhood density and gap awareness

## Deterministic Metrics

All core ministry metrics must be explainable, auditable, and inspectable.

### Ministry Vitality Score

`MVS = (Retention * 0.4) + (Engagement * 0.3) + (Leader_to_Member_Ratio * 0.3)`

Requirements:

- persist the component inputs
- store church-scoped time-series data
- never present the score as spiritual authority

### Burnout Guardian

Baseline rule:

- flag anyone serving in more than 3 distinct ministry or pathway categories

This extends the current burnout logic already in the repo.

### Discipleship Velocity

Definition:

- average days from first-visit milestone to first leadership milestone

This remains planned until the milestone ledger is implemented explicitly.

### Children's Safety Index

Operational inputs:

- safety-clearance freshness
- classroom ratio adherence
- escalation history

## Unified History Model

ChurchForge ministry data should support three historical perspectives over the same people model.

### Member History

- attendance
- certifications
- track participation
- serving assignments
- appropriate impact milestones

### Leader History

- leadership tenure
- mentorship relationships
- team health during tenure
- leader multiplication

### Pastor Oversight

- strategic review across tracks
- curriculum review
- pastoral care and confidential oversight

## Security Guardrails

### Children

- medical alerts and pickup data must not be stored in open text fields
- sensitive children data requires tighter access and encrypted storage patterns

### Marriage And Pastoral Care

- marriage and care notes must not live in general ministry records
- access should remain pastor-elder scoped unless explicitly delegated

### Access Auditing

Sensitive view access should log:

- viewer
- subject
- church
- purpose
- surface
- timestamp

### AI Disclaimer

Every AI-assisted score, pairing, suggestion, or commentary must include:

`This is an assistive tool only and does not replace prayer, Scripture, or human discernment.`

## Current Repo Compatibility Rules

The current codebase already includes:

- `ministries`
- `profile_ministries`
- ministry health score foundations
- burnout alerts
- kingdom impacts
- member-number and offline-profile support

Because of that, the next ministry expansion must be additive:

- do not replace existing ministry assignment tables
- do not force `member_number` onto every offline visitor record
- do not duplicate attendance in a second source-of-truth table
- do not introduce AI-only opaque scoring

## Implementation Order

1. Keep planning docs aligned.
2. Add additive schema for pathway tracking and track metrics.
3. Add stricter RLS and access-audit coverage for sensitive track views.
4. Build read-only dashboards before write-heavy automation.
5. Add AI-assisted pairing and commentary only after deterministic metrics are already visible and explainable.

## Source Of Truth

Use these documents in this order:

1. `DEVELOPMENT_PLAN.md` for product and release discipline
2. `ministry-spec.md` for the repo-level ministry summary
3. `advanced_ministry_elder_pastor.md` for the broader distinctive product direction
4. `docs/advanced-ministry-forge-research-spec.md` for implementation-facing ministry architecture and compatibility constraints
