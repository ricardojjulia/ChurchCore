# Advanced Ministry Forge Research Specification

**Living Document** - Last Updated: April 14, 2026  
**Purpose**: This document reconciles the latest Ministry Forge expansion direction with the ChurchCore Ops tenant architecture that already exists in this repository.

This specification is the planning bridge between:

- `docs/plans/ministry-spec.md`
- `DEVELOPMENT_PLAN.md`
- `docs/plans/advanced-ministry-elders-pastor.md`
- `docs/sprint2-attendance-identity-flow.md`

It does not replace the current shipped schema. It defines the next approved direction for specialized ministry pathways, deterministic stewardship metrics, and stricter safety and confidentiality controls.

## Why This Exists

ChurchCore Ops already has:

- `ministries`
- `profile_ministries`
- ministry health scoring foundations
- burnout alerts
- kingdom impact logging
- member identity and offline-profile support

Your new specification extends that foundation with a more explicit operating model:

- demographic-specific ministry tracks
- specialized service tracks
- track-level stewardship scoring
- unified long-range formation history across member, leader, and pastor roles
- stronger confidentiality boundaries for children, marriage, and pastoral review

The important engineering constraint is that this must be additive to the current tenant data plane, not a parallel system that duplicates existing ministry assignment, attendance, and profile logic.

## Research-Aligned Ministry Track Architecture

ChurchCore Ops should move from broad ministry labeling toward explicit track pathways.

Canonical track kinds:

- `men`
- `women`
- `children`
- `youth`
- `young_adult`
- `marriage`
- `education`
- `missions`
- `outreach`

These track kinds are not a replacement for `ministries.ministry_type`.

Use the distinction below:

- `ministries.ministry_type` remains the operational classification for a specific ministry or team.
- `ministry_tracks.track_kind` becomes the longitudinal pathway classification for a person's formation, care, leadership, and service history.

Example:

- A member can belong to the `young_adult` track while serving in a ministry whose `ministry_type = outreach`.
- A pastor can oversee the `marriage` track without being the leader of every underlying ministry instance or event.

## Track Model Principles

1. A person may participate in multiple tracks over time.
2. Tracks must support historical records, not only current assignment.
3. Track membership is distinct from one-off event attendance.
4. Track leadership history should remain queryable after tenure ends.
5. Children, marriage, and pastor-only data require tighter policy boundaries than ordinary ministry records.

## Research-Driven Ministry Capabilities

### Children's Church

Core direction:

- secured, age-graded classrooms
- teacher-to-child ratio enforcement
- guardian-aware check-in and emergency contact flows

Target differentiators:

- Safety-First Dashboard
- ratio breach alerting
- volunteer safety-clearance visibility
- emergency paging support to guardians and on-site leaders

### Men's Ministry

Core direction:

- mentorship-heavy huddles
- multi-generational discipleship relationships

Target differentiators:

- Mentorship Map
- discipleship tree visualization
- fruitfulness and multiplication tracking

### Women's Ministry

Core direction:

- life-stage circles
- multi-generational support
- study and care pairing

Target differentiators:

- Life-Stage Matching
- seasonal support pairings such as empty nesters and new moms
- interest-aware connection support

### Youth

Core direction:

- large-group gatherings with breakout structures
- milestone tracking before graduation or aging out

Target differentiators:

- Graduation Readiness
- milestone alerts
- transition readiness into young-adult pathways

### Young Adults

Core direction:

- transition support around vocation, community, and calling

Target differentiators:

- Career-Kingdom Link
- industry-aware mentorship with older believers
- calling and workplace discipleship support

### Marriage

Core direction:

- mentor-couple cohorts
- enrichment and care rhythms

Target differentiators:

- Marriage Pulse
- anonymous aggregate theme insight
- sermon and care-theme visibility for pastors

### Education

Core direction:

- doctrinal classes
- discipleship pathways
- certification or completion milestones

Target differentiators:

- Doctrinal Blueprint
- curriculum coverage map
- theological gap visibility across a member journey

### Missions

Core direction:

- trip participation
- partner support
- outcome tracking

Target differentiators:

- Impact Ledger
- partner-linked funds, hours, and milestone reporting

### Outreach

Core direction:

- community partnerships
- care and evangelism follow-up

Target differentiators:

- Neighborhood Density
- zone-based care visibility
- low-coverage area highlighting

## Deterministic Measures

The following measures are approved as deterministic analytics foundations. They may be computed in SQL or server code, but they must remain inspectable and explainable.

### Ministry Vitality Score

Formula:

`MVS = (Retention * 0.4) + (Engagement * 0.3) + (Leader_to_Member_Ratio * 0.3)`

Requirements:

- store component metrics, not only the final score
- keep the score church-scoped and time-stamped
- never present it as spiritual authority
- where AI commentary is added, include the standard disclaimer

### Burnout Guardian

Deterministic baseline:

- flag any person serving in more than 3 distinct ministry categories or track categories

This must extend the existing burnout model rather than replace it. ChurchCore Ops already tracks ministry load; the next step is cross-track and cross-category aggregation.

### Discipleship Velocity

Definition:

- average number of days from `first_visit` to first recognized leadership milestone

Notes:

- the repo does not yet have a complete milestone ledger
- this metric should not be implemented until leadership milestone events are persisted explicitly

### Children's Safety Index

Deterministic inputs:

- volunteer background-check or safety-clearance status
- room ratio adherence
- ratio breach history
- clearance expiration windows

This metric is operational, not pastoral, and should be visible only to authorized leaders.

## Unified History Model

The new system should support three longitudinal views over the same underlying people model.

### Member Track

Should include:

- attendance history
- class or doctrinal certification progress
- ministry-track participation
- answered-prayer or impact milestones where appropriate

### Leader Track

Should include:

- tenure periods
- mentorship relationships
- team-health outcomes during their tenure
- leader multiplication count

### Pastor Track

Should include:

- pastoral-care and oversight records
- curriculum review workflow
- strategic review access to specialized tracks

Pastor visibility must be broader than ordinary leaders, but still bounded by church scope and confidentiality rules.

## Schema Direction Compatible With Current Repo

The original prompt proposed making `profiles.member_number` required. That is not compatible with the current offline-profile and visitor model already implemented in Sprint 2.

Adjusted rule:

- `member_number` remains unique when present
- it should be generated for approved portal accounts and other church-approved identities
- it should not be forced on every offline visitor record at insert time

Recommended additive schema direction:

```sql
alter table public.profiles
  add column if not exists safety_clearance_date date,
  add column if not exists specialized_tags text[] default '{}'::text[];

create table if not exists public.ministry_tracks (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  track_kind text not null
    check (
      track_kind in (
        'men',
        'women',
        'children',
        'youth',
        'young_adult',
        'marriage',
        'education',
        'missions',
        'outreach'
      )
    ),
  role_type text not null
    check (role_type in ('member', 'leader', 'pastor')),
  status text not null default 'active'
    check (status in ('active', 'historical')),
  ministry_id uuid references public.ministries(id) on delete set null,
  start_date date,
  end_date date,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.track_health_metrics (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  track_kind text not null
    check (
      track_kind in (
        'men',
        'women',
        'children',
        'youth',
        'young_adult',
        'marriage',
        'education',
        'missions',
        'outreach'
      )
    ),
  vitality_score numeric(5,2) not null default 0,
  retention_rate numeric(5,2) not null default 0,
  engagement_rate numeric(5,2) not null default 0,
  leader_to_member_ratio numeric(6,3) not null default 0,
  leader_pipeline_velocity_days integer,
  calculated_at timestamptz not null default timezone('utc', now())
);
```

## Data Model Boundaries

Use these responsibilities:

- `profiles`: person identity, generalized contact info, cross-surface metadata
- `profile_ministries`: assignment to specific ministries and ministry roles
- `ministry_tracks`: pathway-level membership and tenure over time
- `attendance`: event participation
- `event_rosters`: event staffing and short-range serving assignments
- `track_health_metrics`: time-series health calculations for track dashboards

This avoids overloading one table with both event-level and pathway-level meaning.

## Security And Ethical Guardrails

### Children

- medical alerts and pickup codes must not live in generic profile text fields
- any such data requires field-level encryption or encrypted payload storage
- only explicitly authorized children leaders, pastors, and approved admins may access

### Marriage And Pastoral Care

- marriage-care notes must not be stored in general ministry comments
- pastoral review and marriage notes must remain pastor-elder scoped

### Audit Requirements

Every sensitive profile or leadership-pathway access should log:

- `viewer_profile_id`
- `subject_profile_id`
- `church_id`
- `purpose`
- `viewed_at`
- `surface`

This is stricter than ordinary write auditing and should be treated as a dedicated access-audit stream.

### AI Guardrail

Any AI-assisted score, commentary, matching result, or recommended action must display the canonical disclaimer:

`This is an assistive tool only and does not replace prayer, Scripture, or human discernment.`

## Recommended Implementation Order

1. Extend the planning docs and approved architecture.
2. Add additive schema for `specialized_tags`, `ministry_tracks`, and `track_health_metrics`.
3. Add track-scoped RLS and access audit logging before any UI work.
4. Build read-only track dashboards for church-admin and pastor users.
5. Add children safety and mentorship relationship models as separate confidential slices.
6. Add AI-assisted pairing and insights only after deterministic metrics are visible first.

## Explicit Non-Goals For The First Implementation Slice

- no opaque AI-only scoring
- no unrestricted leader access to children or marriage-sensitive data
- no replacement of existing `profile_ministries`, `attendance`, or `event_rosters`
- no forced `member_number` generation for every offline visitor
- no demographic inference from age or gender without explicit church data and review
