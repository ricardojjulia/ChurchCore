# ChurchCore Ops - Advanced Ministries, Elders & Pastor Council Plan

**Living Document** - Last Updated: April 15, 2026  
**Filename**: `docs/plans/advanced-ministry-elders-pastor.md`  
**Version**: 1.1  
**Purpose**: This is the single source of truth for the most distinctive and spiritually rich feature direction in ChurchCore Ops: the areas intended to set the product apart from conventional church management software.

This document extends `DEVELOPMENT_PLAN.md`, especially sections 2, 3, 4, 5, and 7. It also depends on the churchgoer data model direction defined in `docs/plans/churchgoer-data.md`.

The repo-level ministry summary now lives in `docs/plans/ministry-spec.md`.

The deeper 2026 specialization direction for demographic-specific and service-specific pathways is documented in `docs/advanced-ministry-forge-research-spec.md`. Use that document when reconciling new Ministry Forge work with the current tenant schema and Sprint 2 identity model.

**Differentiator Statement**  
"While other platforms manage schedules and donations, ChurchCore Ops forges spiritually healthy ministries, protects elder unity, and equips pastors to lead with wisdom, powered by AI that knows its place beneath the Holy Spirit."

## Table of Contents

- [1. Vision & Unique Differentiators](#1-vision--unique-differentiators)
- [2. Data Model & Schema Extensions](#2-data-model--schema-extensions)
- [3. Ministry Forge](#3-ministry-forge)
- [4. Elders Discernment Room](#4-elders-discernment-room)
- [5. Pastor Council Forge](#5-pastor-council-forge)
- [6. Cross-Cutting Spiritual Guardrails & AI Tools](#6-cross-cutting-spiritual-guardrails--ai-tools)
- [7. Integration with Core Systems](#7-integration-with-core-systems)
- [8. Mobile & Portal Experiences](#8-mobile--portal-experiences)
- [9. Security, Privacy & Ethical Guardrails](#9-security-privacy--ethical-guardrails)
- [10. Implementation Roadmap & Sprint Plan](#10-implementation-roadmap--sprint-plan)
- [11. How to Use This Document](#11-how-to-use-this-document)

## 1. Vision & Unique Differentiators

**Core Vision**  
Create living digital spaces where ministries thrive, elders discern in unity, and pastors are refreshed, not merely managed.

**Distinctive capability direction**

- **Ministry Health Score**: AI-assisted holistic metric combining attendance, engagement, spiritual growth signals, volunteer retention, and burnout risk.
- **Discernment Room**: Private elder workspace with prayer walls, Scripture-aligned voting, and AI wisdom prompts that never make decisions.
- **Pastor Council Forge**: Collaborative sermon and outreach planning with version history, theological review support, and sabbath-aware workload guardrails.
- **Spiritual Gifts + Calling Matcher**: AI-assisted, human-reviewed matching that can inform serving and volunteer pathways.
- **Liturgical Intelligence**: Automatic awareness of church calendar seasons, lectionary readings, and feast days across planning tools.
- **Burnout Guardian**: Proactive overload detection with sensitive rotation and rest suggestions.
- **Kingdom Impact Dashboard**: Tracks narrative and ministry outcomes alongside traditional operational metrics.
- **Specialized Ministry Tracks**: Separate pathway intelligence for men, women, children, youth, young adults, marriage, education, missions, and outreach instead of a single catch-all formation model.

These features must remain assistive and subordinate to human pastoral authority, prayer, Scripture, and church governance.

## 1.1 Specialized Track Expansion

ChurchCore Ops should treat the following as distinct long-range pathway categories:

- `men`
- `women`
- `children`
- `youth`
- `young_adult`
- `marriage`
- `education`
- `missions`
- `outreach`

These tracks are intentionally more granular than the current `ministries.ministry_type` field. The long-term model should distinguish:

- ministry operations for concrete teams, assignments, and events
- ministry tracks for formation, mentoring, lifecycle transitions, and strategic oversight

Implementation-facing details, deterministic score definitions, and compatibility rules are maintained in `docs/advanced-ministry-forge-research-spec.md`.

## 2. Data Model & Schema Extensions

The following schema direction extends the existing tenant data model and should be implemented only with matching RLS, audit logging, and sensitive-data review.

```sql
-- Ministry extensions
alter table public.ministries
  add column if not exists ministry_type text
    check (
      ministry_type in (
        'outreach',
        'discipleship',
        'worship',
        'care',
        'administration',
        'youth',
        'children',
        'missions'
      )
    ),
  add column if not exists health_score numeric(4,2) default 0,
  add column if not exists last_health_assessment timestamptz,
  add column if not exists vision_statement text,
  add column if not exists scriptural_anchor text[];

-- Confidential elder notes
create table if not exists public.elder_notes (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches(id) not null,
  profile_id uuid references public.profiles(id),
  created_by uuid references public.profiles(id) not null,
  content text not null,
  is_confidential boolean not null default true,
  created_at timestamptz not null default now()
);

-- Discernment sessions
create table if not exists public.discernment_sessions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches(id) not null,
  title text not null,
  date timestamptz,
  status text
    check (status in ('open', 'voting', 'closed', 'prayer'))
    default 'open',
  outcome text,
  created_at timestamptz not null default now()
);

-- Spiritual gifts assessment
create table if not exists public.spiritual_gifts (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches(id) not null,
  profile_id uuid references public.profiles(id) not null,
  gift_type text not null,
  strength_score int not null check (strength_score between 1 and 10),
  assessed_by_ai boolean not null default false,
  assessed_date timestamptz,
  created_at timestamptz not null default now()
);

-- Kingdom impact logs
create table if not exists public.kingdom_impacts (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches(id) not null,
  ministry_id uuid references public.ministries(id),
  profile_id uuid references public.profiles(id),
  impact_type text not null
    check (
      impact_type in (
        'prayer_answered',
        'disciple_made',
        'salvation',
        'restored_relationship'
      )
    ),
  description text,
  occurred_at timestamptz not null default now()
);
```

Implementation requirements:

- Add explicit RLS for every new table.
- Treat elder notes, discernment sessions, and AI-derived ministry health data as sensitive.
- Ensure all new records are church-scoped and never readable across tenants.
- Add audit coverage for access to elder and pastor-only spaces.

## 3. Ministry Forge

The Ministry Forge is the advanced ministry operating surface for leaders and pastors.

### Core capabilities (preserved in all ministry types)

- Ministry dashboard with Health Score and trend view
- AI volunteer matcher based on gifts, availability, and human-reviewed calling data
- Ministry vision board with scriptural anchors
- Burnout Guardian alerts for ministry leaders
- Track-level stewardship dashboards for demographic and service pathways
- Mentorship and multiplication visibility for leadership development
- Quick-log flow for post-event kingdom impact entries
- Seasonal planning wizard tied to liturgical context
- Children's safety visibility for clearance and ratio-sensitive serving contexts

### Ministry-type-specific management panels

When a ministry's `ministry_type` matches one of the five supported track types, an additional dedicated tab appears in the Ministry Forge dashboard. The existing Overview, Members, Impact Log, Vision, and Volunteer Matcher tabs are always preserved.

Supported dedicated panels:

- **Worship** (`ministry_type = 'worship'`) — rehearsal schedule, set list tracker, team roster by instrument/role, rotation planner, song usage history, Sunday preparation notes
- **Men's Ministry** (`ministry_type = 'men'`) — mentorship map, discipleship group assignments, multiplication tracker, brotherhood events, accountability pairs (pastor-only), leadership pipeline
- **Women's Ministry** (`ministry_type = 'women'`) — life-stage circles, study groups, support pairing, events and retreats, care follow-up queue (pastor-only), mentorship availability
- **Marriage Ministry** (`ministry_type = 'marriage'`) — mentor-couple registry, enrichment cohorts, event schedule, aggregate pastoral themes (anonymous, pastor-only), care referral queue, anniversary recognition
- **Missions** (`ministry_type = 'missions'`) — partner organization registry, trip roster and history, impact ledger, prayer and support partners, financial summary, member engagement

These panels are additive. The ministry_type determines which panel tab is shown. A ministry without a matching type shows only the standard tabs.

### Ministry_type constraint extension

The `ministries.ministry_type` check constraint must be extended to include:

- `worship`
- `men`
- `women`
- `marriage`

(These are added alongside the already-supported `outreach`, `discipleship`, `care`, `administration`, `youth`, `children`, `missions`.)

**Primary route**

- `/app/church-admin/ministry/[id]`

**Expected surface design**

- Minimal, focused, actionable
- Metrics visible only when useful
- Narrative ministry context preserved alongside charts and status
- Mantine-first implementation aligned with ChurchCore Ops UI standards
- Type-specific tabs appear conditionally — never cluttering ministries that don't match

## 4. Elders Discernment Room

The Elders Discernment Room is a private, invitation-only tenant workspace for `pastor_elder` users.

**Capabilities**

- Prayer wall with anonymous or named requests and "I prayed" acknowledgements
- Discernment voting with confidential ballots
- AI wisdom prompts surfacing relevant Scripture and approved historical commentary
- Searchable session history with outcome tracking
- Unity check visualizations before major decisions

**Primary route**

- `/elders/discernment`

**Constraints**

- AI may surface passages, summaries, and prompts, but never recommendations framed as spiritual authority.
- Voting, notes, and draft discussion content must be access-controlled more tightly than ordinary church administration data.

## 5. Pastor Council Forge

The Pastor Council Forge is the collaborative planning workspace for pastors, elders, and approved key leaders.

**Capabilities**

- Sermon Forge collaborative outline editor with version history
- Theological guardrail checker against church-defined doctrine
- Series planner with liturgical-calendar integration
- Leadership pipeline view for formation and mentoring milestones
- Sabbath and renewal workload guardrails
- Council minutes with AI-assisted summarization and follow-up extraction

**Primary route**

- `/council/forge`

**Product requirement**

The experience should feel like a reverent study-and-planning room, not a generic corporate project board.

## 6. Cross-Cutting Spiritual Guardrails & AI Tools

Every AI-enabled surface in this document must follow these rules:

- Every AI response includes an assistive-only disclaimer.
- Deterministic score components must be inspectable before any AI narrative layer is added.
- Prompt templates are stored in a reviewed prompt library.
- Retrieval uses only approved Bible translations and approved commentary sources.
- Human approval is required before AI-generated content is shared with a church audience.
- Churches must be able to disable AI features entirely.

## 7. Integration with Core Systems

These features are intended to integrate with the core tenant data plane:

- `profiles`
- `ministries`
- `profile_ministries`
- `events`
- churchgoer/member profile extensions defined in the churchgoer data direction

Integration expectations:

- Real-time updates may use Supabase Realtime where appropriate.
- The calendar should surface ministry events, elder sessions, and council meetings.
- Churchgoer-facing surfaces should expose only public ministry opportunities and approved impact stories.
- Control-plane systems must not directly absorb tenant runtime data from these features.

## 8. Mobile & Portal Experiences

- Elders and pastors should receive a dedicated mobile-friendly Forge experience.
- Prayer interactions should be one-tap where appropriate.
- PWA support is acceptable in later phases.
- Offline access must be limited carefully for confidential content and should not be assumed by default.

## 9. Security, Privacy & Ethical Guardrails

- Elder and council data requires stricter RLS than ordinary church-admin surfaces.
- Children's safety records, marriage-care insights, and pastoral review data require stricter access than ordinary ministry dashboards.
- Confidential notes must never be visible to ChurchAdmin unless explicitly authorized by church governance rules.
- Every access to elder or council spaces must be audit logged.
- Every access to sensitive ministry-track views should be audit logged with purpose metadata.
- AI consent must be captured before first use of Forge features.
- Sensitive pastoral or discernment content should be reviewed for field-level encryption needs before implementation.

## 10. Implementation Roadmap & Sprint Plan

This roadmap is aspirational and should be re-phased against the current master plan before engineering starts.

- **Sprint 4 or later**: Ministry Forge foundations and initial health scoring
- **Sprint 5 or later**: Elders Discernment Room foundations and prayer wall
- **Sprint 6 or later**: Pastor Council Forge and sermon collaboration foundation
- **Sprint 7 or later**: Kingdom impact tracking and deeper integrations
- **Sprint 8+**: PWA polish, liturgical intelligence expansion, and beta church validation

**Task checklist**

- Extend the schema with ministry, elder, and impact data structures
- Design and document the Health Score algorithm before coding it
- Build the Elders Discernment Room with real-time prayer wall support
- Implement Pastor Council Forge with collaborative editing and auditability
- Integrate AI guardrails, prompt review, and approved-source retrieval
- Add liturgical-calendar intelligence only after the base event model remains stable

**Acceptance criteria**

- Churches can describe the ministry and leadership tools as spiritually useful rather than merely administratively convenient.
- All features respect role boundaries, consent boundaries, and tenant isolation.
- AI remains assistive, reviewable, and explicitly subordinate to human authority.

## 11. How to Use This Document

1. Open this file before work that touches ministries, elders, pastor-council features, discernment tooling, or leadership AI features.
2. Reference this file and `DEVELOPMENT_PLAN.md` in every related issue and PR.
3. Update this document only through Pull Request.
4. Read this document alongside the churchgoer data plan before implementing any member-facing integration.
5. Treat this document as a feature-direction constitution for the advanced leadership modules.
