# ChurchForge Reporting Implementation Plan

**Living Document** - Last Updated: April 15, 2026  
**Purpose**: This document defines the implementation plan for making ChurchForge a first-class reporting and analytics platform across members, events, giving, communications, ministries, and leadership stewardship.

This plan is intentionally product-forward and engineering-specific. It is designed to move ChurchForge beyond static dashboards and into a reporting system that helps pastors, church-admins, elders, and ministry leaders see what is happening, why it is happening, and where they should prayerfully respond next.

This document should be read alongside:

- `DEVELOPMENT_PLAN.md`
- `ministry-spec.md`
- `advanced_ministry_elder_pastor.md`
- `docs/advanced-ministry-forge-research-spec.md`
- `docs/sprint2-attendance-identity-flow.md`

## 1. Reporting Vision

Church software usually fails in one of two ways:

1. it provides only export-style tables that are technically useful but visually exhausting
2. it provides shallow dashboards that look modern but do not answer real ministry questions

ChurchForge should do neither.

The reporting system should become:

- highly graphical
- easy to filter without requiring training
- multi-tenant safe
- pastorally useful rather than merely administratively impressive
- explainable in every derived metric
- respectful of confidentiality and theological guardrails

The core product promise is:

**Turn church activity into actionable stewardship intelligence without turning people into anonymous corporate metrics.**

## 2. Reporting Principles

Every report and dashboard in this plan should follow these principles.

### 2.1 Decision-First, Not Chart-First

Every report should answer at least one real question, such as:

- Which members are drifting quietly?
- Which event categories are growing or collapsing?
- Which funds are healthy versus at risk?
- Which ministry pathways are producing leaders?
- Which outreach zones are being overlooked?

### 2.2 Progressive Disclosure

Each report should have three layers:

- executive summary cards
- interactive charts and segment breakdowns
- drill-down tables with export capability

### 2.3 Explainable Metrics

Every derived score must show:

- how it is calculated
- which fields contribute to it
- the time window used
- the last time it was refreshed

### 2.4 Mobile-Friendly and Touch-Friendly

Reports must work on phones and tablets, not only desktop dashboards.

### 2.5 Pastoral Restraint

ChurchForge should surface insight, not spiritual judgment.

Any AI-assisted interpretation must include:

`This is an assistive tool only and does not replace prayer, Scripture, or human discernment.`

## 3. Primary Reporting Surfaces

The reporting system should not live in one giant page. It should be structured as a reporting suite with a clear information architecture.

### 3.1 Core Route Structure

Recommended routes:

- `/app/reports`
- `/app/reports/members`
- `/app/reports/events`
- `/app/reports/giving`
- `/app/reports/ministries`
- `/app/reports/communications`
- `/app/reports/outreach`
- `/app/reports/executive`

Recommended future specialized routes:

- `/app/reports/children-safety`
- `/app/reports/discipleship`
- `/app/reports/marriage`
- `/app/reports/missions`

### 3.2 Role Visibility

- `church_admin`: broad operational reporting except pastor-confidential notes
- `pastor_elder`: full stewardship reporting including sensitive pastoral dimensions where allowed
- `ministry_leader`: scoped ministry and event reporting only
- `member_volunteer`: only self-service reporting where explicitly allowed

## 4. Report Families

### 4.1 Executive Stewardship Dashboard

Audience:

- pastor
- church_admin
- elders where governance permits

Purpose:

- one-screen health view across people, events, giving, ministries, and communications

Core visuals:

- attendance trend line
- first-time visitor to member funnel
- giving trend area chart
- ministry vitality heatmap
- care-risk distribution
- outreach density map

Core cards:

- attendance this week vs last week
- active serving load
- recurring donor retention
- unresolved care follow-up count
- visitor assimilation rate
- ministry vitality average

Distinctive feature:

- **Stewardship Weather Map**
  This summarizes where the church is warming, cooling, or straining across people, giving, ministry load, and outreach presence.

### 4.2 Member Intelligence Reports

Purpose:

- help leaders understand attendance, assimilation, serving, care, formation, and engagement across the congregation

Core reports:

- member growth and churn report
- attendance consistency report
- visitor assimilation funnel
- household engagement report
- serving-load report
- discipleship progression report
- care follow-up report
- directory completeness and contactability report

Core dimensions:

- campus or church location if later added
- household
- age band
- ministry involvement count
- track kind
- membership status
- join cohort
- first visit cohort
- contact permission
- directory visibility
- preferred contact method

Distinctive features:

- **Quiet Drift Detector**
  Finds members whose attendance, serving, and communications engagement are all declining without a formal inactive status.

- **Discipleship Flow Sankey**
  Shows how people move from visitor to attender to volunteer to leader to mentor over time.

- **Household Momentum Score**
  Highlights households that are deepening, plateauing, or disconnecting.

### 4.3 Event Intelligence Reports

Purpose:

- move beyond calendar management into event effectiveness and operational readiness

Core reports:

- attendance by event and category
- RSVP conversion vs actual attendance
- roster fill and no-show report
- volunteer fatigue by event series
- event time-slot performance
- visitor-generating events report
- follow-up outcomes after events

Core dimensions:

- event category
- ministry
- organizer
- event series
- weekday
- time of day
- seasonal period
- event visibility
- rostered vs attended
- event size band

Distinctive features:

- **Event Energy Curve**
  A visual showing which time slots and event formats consistently produce stronger turnout and repeat attendance.

- **Second-Visit Yield**
  Measures which events produce actual return engagement, not just one-night attendance spikes.

- **Volunteer Pressure Overlay**
  Combines roster demand, attendance growth, and burnout alerts in one chart to show when popular events are being sustained by fragile staffing.

### 4.4 Giving Intelligence Reports

Purpose:

- give pastors and admins a truthful, usable picture of generosity without reducing giving to finance-only analysis

Core reports:

- total giving trend
- by-fund breakdown
- recurring giving retention
- donor cohort retention
- first-time giver conversion
- giving seasonality
- pledge or commitment fulfillment if added later
- donor frequency report
- anonymous giving ratio

Core dimensions:

- fund designation
- payment type
- recurring vs one-time
- donor cohort month
- household
- age band
- membership status
- ministry involvement count
- event-linked giving campaign

Distinctive features:

- **Generosity Journey**
  Tracks movement from non-giver to first-time giver to recurring giver to campaign giver without exposing anonymous identities.

- **Fund Resilience Meter**
  Shows how dependent each fund is on a small number of givers or seasonal spikes.

- **Pastoral Giving Themes**
  A non-invasive aggregate view of generosity rhythms that helps leadership see whether teaching, campaigns, or ministry moments are correlating with increased generosity.

### 4.5 Ministry and Pathway Reports

Purpose:

- expose which ministries and demographic pathways are healthy, multiplying, overloaded, or under-supported

Core reports:

- ministry vitality scoreboard
- leader pipeline report
- volunteer match acceptance report
- burnout alert trend report
- track membership growth report
- mentorship coverage report
- ministry-to-event output report
- kingdom impact trend report

Core dimensions:

- ministry type
- track kind
- leader tenure
- member count band
- volunteer load band
- impact type
- ministry age
- meeting frequency

Distinctive features:

- **Leadership Multiplication Tree**
  Graph visualization of who trained whom and which ministries are generating new leaders.

- **Mentorship Coverage Gap**
  Shows which demographics have participants but not enough mature leaders or mentors.

- **Ministry Yield Matrix**
  Cross-plots ministry participation, volunteer burden, and kingdom impact so leaders can spot ministries that are busy but not fruitful or fruitful but dangerously understaffed.

### 4.6 Communications Reports

Purpose:

- help leadership understand reach, consent, response, and engagement quality

Core reports:

- send volume by channel
- delivery and failure rates
- consent coverage
- role-based communication reach
- message timing effectiveness
- opt-out trend analysis
- follow-up completion report

Core dimensions:

- channel
- role
- ministry
- track kind
- communication type
- schedule window
- audience segment

Distinctive features:

- **Consent Coverage Atlas**
  Shows where the church can actually reach people and where contact data or opt-in coverage is weak.

- **Message Fatigue Radar**
  Highlights segments receiving disproportionate communication volume relative to engagement.

### 4.7 Outreach and Mission Reports

Purpose:

- make external-facing ministry measurable without flattening it into generic corporate KPIs

Core reports:

- outreach participation report
- community zone coverage report
- repeat-contact report
- follow-up and care completion after outreach
- mission trip effort and impact ledger
- partner organization outcomes

Core dimensions:

- neighborhood or zone
- partner organization
- outreach event type
- volunteer team
- follow-up owner
- impact type
- household status

Distinctive features:

- **Neighborhood Density Map**
  Heatmap of where the church is consistently serving versus where presence is thin.

- **Impact Ledger**
  Combines hours, funds, participation, salvations, discipleship milestones, and care follow-up into one mission or outreach reporting frame.

## 5. Never-Seen or Rarely-Seen Differentiators

These are the kinds of capabilities that would make ChurchForge genuinely distinctive.

### 5.1 Shepherding Radar

A graph-based report that combines:

- recent attendance decline
- missed follow-up
- no active ministry connection
- unresolved care notes
- low communication reachability

It does not judge spirituality. It simply helps leaders see who may be quietly disappearing from view.

### 5.2 Return Probability Bands

For visitors and newer households, calculate deterministic return-likelihood bands using:

- first visit recency
- second visit occurrence
- event type
- follow-up completion
- contactability

This should remain deterministic first, with any AI narrative layered on later.

### 5.3 Sermon-to-Response Correlation

A future pastoral report that correlates:

- sermon series windows
- prayer requests
- first-time responses
- giving shifts
- ministry signups

This is not to evaluate sermons commercially. It is to help pastors discern which teaching seasons align with visible congregational response.

### 5.4 Formation Coverage Blueprint

A report that shows which discipleship topics, doctrinal modules, or ministry experiences a member or cohort has actually encountered.

This becomes especially powerful once education, marriage, youth, and young-adult tracks are expanded.

### 5.5 Story-Backed Metrics

Allow charts to link to:

- kingdom impact stories
- answered prayer logs
- notable milestones

This prevents the reporting system from becoming emotionally sterile.

## 6. Graphical Design System for Reports

ChurchForge reporting should look intentional and calm, not like generic BI software.

### 6.1 Visualization Types

Preferred chart types:

- line charts for trend
- area charts for cumulative movement
- stacked bars for segment comparison
- heatmaps for density and schedule patterns
- cohort grids
- funnel charts
- sankey diagrams for pathway movement
- radial progress for bounded scores
- map overlays for outreach and geography
- network graphs for mentorship and leader multiplication

### 6.2 Interaction Patterns

Every report should support:

- date range selection
- saved segment presets
- compare mode
- hover drill-down
- export table
- shareable filtered URL
- “show me why” metric explanation drawer

### 6.3 Usability Requirements

- every chart must have a table fallback
- color may not be the only signal
- empty states must still be informative
- filters must be human-readable
- legends must use church language, not raw schema names

## 7. Data Model and Warehouse Direction

The current repo is application-first, not warehouse-first. That is acceptable for the initial reporting phases.

### 7.1 Reporting Strategy

Phase 1 should use live operational tables plus materialized summary tables where needed.

Recommended progression:

1. live table queries for current dashboards
2. materialized views for expensive trend reports
3. scheduled rollups for cohort and time-series analytics
4. optional analytics warehouse only if scale truly requires it

### 7.2 Recommended Summary Objects

Recommended additions:

- `member_reporting_snapshots`
- `event_reporting_snapshots`
- `giving_reporting_snapshots`
- `ministry_reporting_snapshots`
- `communication_reporting_snapshots`
- `outreach_reporting_snapshots`

Recommended materialized views:

- `mv_attendance_by_week`
- `mv_event_attendance_summary`
- `mv_member_engagement_summary`
- `mv_giving_by_month`
- `mv_donor_retention_cohorts`
- `mv_ministry_vitality_summary`
- `mv_communications_delivery_summary`

### 7.3 Event Model Enhancements Needed

To support stronger event reporting, eventually add:

- event series identifier
- event template identifier
- event outcome tags
- follow-up campaign link
- attendance source segmentation

### 7.4 Member Milestone Ledger

To support true discipleship and lifecycle reporting, add a milestone table such as:

- first_visit
- second_visit
- membership_class_completed
- baptism
- ministry_joined
- ministry_leader_started
- mentor_assigned
- curriculum_completed

Without this ledger, discipleship velocity and pathway reports will remain approximate.

## 8. Security and Confidentiality Requirements

Reporting increases risk because it aggregates sensitive data at scale.

### 8.1 Access Boundaries

- pastor-only reports may include care-sensitive aggregates
- children-related reports require stricter access
- anonymous gifts may never be de-anonymised through filters
- marriage and pastoral notes may never appear in general reporting

### 8.2 Safe Aggregation Rules

Use suppression thresholds for sensitive segments:

- do not show highly sensitive breakdowns with very small counts
- mask identities when counts fall below a configured threshold
- avoid re-identification through combined filters

### 8.3 Audit Requirements

High-sensitivity report access should be audited with:

- viewer
- report id
- filters applied
- church id
- timestamp
- purpose where required

## 9. AI and Insight Layer

AI should not generate the core report data. It may assist with interpretation after deterministic metrics are computed.

### 9.1 Allowed AI Uses

- summarize notable changes
- translate chart patterns into readable observations
- suggest follow-up questions
- recommend additional filters
- generate narrative executive summaries

### 9.2 Disallowed AI Uses

- inventing metrics
- deciding pastoral action automatically
- exposing sensitive personal information unnecessarily
- classifying spiritual maturity

### 9.3 Insight Cards

Recommended pattern:

- each major dashboard has optional AI insight cards
- each card cites the underlying metric or trend
- each card includes the standard disclaimer
- AI can be disabled per church

## 10. Implementation Phases

### Phase 1: Reporting Foundation

Deliver:

- `/app/reports` shell
- shared reporting layout and filter bar
- chart component library
- exportable table component
- report permission model
- report definitions and metadata registry

Technical tasks:

- create `lib/reports/` module
- define chart config types
- define report metadata model
- create query helpers and time-range utilities
- create empty-state and preview-safe loaders

### Phase 2: Members, Events, Giving Core Reports

Deliver:

- member intelligence dashboard
- event intelligence dashboard
- upgraded giving intelligence dashboard

Technical tasks:

- add snapshot tables or materialized views for attendance and giving trends
- add cohort query utilities
- add comparison mode
- add CSV export

### Phase 3: Ministry and Communications Reports

Deliver:

- ministry vitality reporting
- volunteer burden and leader pipeline reporting
- communications reach and fatigue reporting

Technical tasks:

- extend ministry rollups
- add communications summary models
- add audience segmentation layer

### Phase 4: Outreach, Missions, and Geographic Reports

Deliver:

- outreach density reports
- impact ledger
- follow-up ownership views
- mission partner effectiveness reporting

Technical tasks:

- add zone and partner dimensions
- add map-oriented data structures
- add outreach follow-up summary tables

### Phase 5: Distinctive ChurchForge Intelligence

Deliver:

- Shepherding Radar
- Discipleship Flow Sankey
- Leadership Multiplication Tree
- Formation Coverage Blueprint
- AI executive summaries with guardrails

Technical tasks:

- milestone ledger
- network graph data models
- pathway and mentorship reporting
- AI narration layer with audit logging

## 11. Suggested Database Additions

This is direction, not an approved migration yet.

Recommended future tables:

- `member_milestones`
- `report_views_audit`
- `mentorship_relationships`
- `event_series`
- `outreach_zones`
- `outreach_contacts`
- `report_saved_views`
- `report_subscriptions`

Recommended future columns:

- `events.series_id`
- `events.template_key`
- `attendance.source_tag`
- `donations.campaign_id`
- `profiles.first_visit_at`
- `profiles.member_since_at`

## 12. Reporting UX Requirements

### 12.1 Saved Views

Users should be able to save:

- date range
- filters
- chart selections
- compare mode

### 12.2 Scheduled Reports

Allow scheduled delivery for:

- weekly executive summary
- monthly giving summary
- event recap report
- ministry health digest

### 12.3 Exports

Support:

- CSV
- print-friendly PDF
- image export for charts

### 12.4 Drilldown Behavior

Clicking any card or chart segment should open:

- a filtered table
- related narrative notes where available
- action links to the relevant operational route

Example:

- low event attendance segment links into `/app/church-admin/events/[id]`
- low communications reach links into `/app/communications`
- giving cohort drop links into `/app/giving`

## 13. Success Criteria

The reporting system is successful when:

- leaders can answer operational and pastoral questions in minutes rather than ad hoc spreadsheet work
- charts are understandable without training
- report pages remain usable on mobile
- each metric is explainable
- reporting supports ministry decisions without violating confidentiality
- ChurchForge surfaces insights that typical church software does not expose

## 14. Recommended First Build

If implementation starts now, build in this order:

1. shared reporting shell and route structure
2. member attendance and assimilation dashboard
3. event performance and volunteer load dashboard
4. upgraded giving intelligence dashboard
5. ministry vitality and burnout reporting
6. communications reach dashboard

This order gives ChurchForge the fastest path to a meaningfully differentiated reporting system while staying aligned with the data already present in the repo.
