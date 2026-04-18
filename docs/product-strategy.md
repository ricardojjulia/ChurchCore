# ChurchForge Product Strategy

**Version:** 1.0
**Date:** 2026-04-17
**Status:** Active — governing document for feature roadmap and market positioning

---

## 1. Mission Statement

ChurchForge is the compliance-first, security-native church management platform built for churches that take child safety, financial integrity, and data privacy seriously. Every other system was built for features first and retrofitted with compliance. ChurchForge is the reverse: the architecture is built on a foundation that makes doing the right thing the easiest thing.

---

## 2. Competitive Landscape

### 2.1 The market leaders and what they cost

| Vendor | Model | Entry Price | Full Feature Price | Weakness |
| --- | --- | --- | --- | --- |
| Planning Center | Per-module, per-person | ~$14/mo (People only) | $100–$300+/mo (all modules) | Expensive, fragmented UX, no GL |
| Pushpay + CCB | Bundle | ~$200–$500/mo | $500–$1,500+/mo | Acquisition baggage, legacy CCB UX |
| Ministry Platform | Enterprise | $500+/mo | $1,000–$3,000+/mo | IT-heavy, not SMB-friendly |
| Breeze | Simple all-in-one | $72/mo | $72/mo | No financials, no CCM compliance |
| Elvanto (ServiceM8) | Mid-market | $50–$150/mo | $150+/mo | Weak financials, no compliance layer |

### 2.2 Planning Center — module-by-module breakdown

Planning Center is the direct benchmark. It dominates mid-size churches ($100–500K attendance). It is modular: churches pay per-module, per-headcount. Its pricing scales painfully.

| PC Module | What it does | ChurchForge status |
| --- | --- | --- |
| People | Member directory, groups, lists | Partial (profiles exist, groups missing) |
| Giving | Online donations, pledge tracking, statements | **NOT BUILT** |
| Check-Ins | Child check-in with label printing | Built (CCM module) |
| Services | Planning worship sets, volunteer scheduling | **NOT BUILT** |
| Groups | Small group management, attendance | **NOT BUILT** |
| Registrations | Event sign-up, forms, payments | **NOT BUILT** |
| Publishing | Church website builder | Out of scope (intentional) |
| Music Stand | Digital sheet music | Out of scope (intentional) |

### 2.3 What ChurchForge already has that they don't

| Capability | ChurchForge | Planning Center | Pushpay/CCB |
| --- | --- | --- | --- |
| Double-entry General Ledger | Yes | No | Partial (CCB) |
| PIN-hashed (bcrypt) child check-in | Yes | No (PIN stored reversibly) | No |
| Custody restriction with UI block | Yes | Basic | No |
| Two-adult rule enforcement | Yes | No | No |
| Audit-append-only ledger | Yes | No | No |
| Per-tenant Supabase isolation | Yes | Shared DB | Shared DB |
| Ministry track progress dashboard | Yes | No | No |
| RLS-enforced multi-tenant security | Yes | N/A | No |
| Financial management with GL | Yes | No | Partial |

### 2.4 Critical gaps to close (Phase 1 — Match)

These gaps mean churches **cannot** replace Planning Center with ChurchForge today. Every item is a hard requirement.

| Gap | Why it's a blocker | Planning Center equivalent |
| --- | --- | --- |
| Online giving | #1 reason churches buy software. No giving = no adoption. | PC Giving |
| Member-facing PWA | Members need self-service: giving history, groups, events, directory | PC app (basic) |
| Small groups | The dominant discipleship model in US churches. Groups need attendance, messaging, resources | PC Groups |
| Email + SMS communications | Announcements, reminders, group messages — integrated, not MailChimp-linked | PC People messaging |
| Event registration | Conferences, VBS, retreats — sign-up + payment | PC Registrations |
| Attendance tracking | Service attendance, group attendance, individual history | PC Check-Ins attendance |

### 2.5 Important gaps to close (Phase 2 — Compete)

These gaps mean ChurchForge is usable but visibly incomplete compared to well-run Planning Center implementations.

| Gap | Why it matters |
| --- | --- |
| Volunteer scheduling | Service planning without volunteer scheduling is incomplete. Room volunteers track doesn't extend to worship team, ushers, parking |
| Member self-service portal | Giving statements, pledge history, group roster, profile updates — self-service reduces admin burden |
| Custom forms | Intake forms, surveys, membership applications, background check consent |
| Giving analytics dashboard | Trend lines, lapsed donor alerts, pledge vs. actual, new donor retention |
| First-visit workflows | Automated follow-up sequences for guests (email day 1, day 7, call prompt week 2) |
| Bulk communications | Segmented email/SMS blasts, open tracking, unsubscribe compliance |

### 2.6 Decisive differentiators — where ChurchForge wins outright (Phase 3 — Win)

These are features that do not exist in any competitor at the price point ChurchForge targets. They are ChurchForge's moat.

| Differentiator | Why it wins | None of the competition has this |
| --- | --- | --- |
| Giving → GL auto-posting | Every donation automatically creates a balanced journal entry. No manual import. | Planning Center has no GL. Pushpay/CCB has no double-entry. |
| AI pastoral insights | Flag members with declining engagement before they leave. Suggest follow-up. Surface patterns across small groups. | No competitor has this with church-appropriate privacy constraints |
| Denomination/network oversight | Multi-church dashboards for district superintendents, bishops, network leaders. Aggregate giving, CCM compliance, ministry progress across 10–500 churches | No affordable competitor supports this |
| Compliance-first CCM as insurance differentiator | Partner with church liability insurers to offer premium discounts for ChurchForge CCM. Court-order tracking, two-adult enforcement, incident reports = documented audit trail insurers require | No competitor is pursuing this partnership model |
| COPPA-native data retention | Automatic purge schedules, annual PII reviews, data minimization in the database design | Privacy lawyers love this. No competitor has it built-in |
| Unified financial + ministry data | Budget vs. actual by ministry team. Cost-per-attendee. Giving allocation to ministry tracks. | No competitor connects these two systems |

---

## 3. Pricing Strategy

### 3.1 Tier structure

| Tier | Monthly | Annual (save 2 months) | Target church size | Modules included |
| --- | --- | --- | --- | --- |
| **Starter** | $59 | $590/yr | Under 100 average attendance | People, Giving, CCM, Finance GL |
| **Growth** | $99 | $990/yr | 100–500 attendance | + Groups, Events, Communications |
| **Pro** | $179 | $1,790/yr | 500–2,000 attendance | + AI Insights, Volunteer Scheduling, Multi-site |
| **Enterprise** | Custom | Custom | 2,000+ / denominations | + Denomination dashboard, SLA, dedicated support, custom SSO |

### 3.2 Pricing rationale

- Planning Center comparable cost at 200 members: ~$100–180/mo (People + Giving + Check-Ins)
- ChurchForge Growth tier at 200 members: $99/mo with GL, CCM compliance, and groups included
- ChurchForge is 30–45% cheaper than PC for an equivalent feature set
- The GL alone is a feature Planning Center cannot match at any price

### 3.3 Revenue model to $18,000 MRR

| Tier | Churches | Monthly revenue |
| --- | --- | --- |
| Starter ($59) | 100 | $5,900 |
| Growth ($99) | 100 | $9,900 |
| Pro ($179) | 25 | $4,475 |
| Enterprise ($500 avg) | 5 | $2,500 |
| **Total** | **230** | **$22,775** |

Infrastructure cost at 230 churches: ~$4,500/mo (Vercel Pro + Platform DB + 230 tenant DBs at $0/mo free tier or $25/mo paid).

**Infrastructure break-even**: ~50 churches on Growth tier covers all fixed costs.
**$18,000 MRR profit**: achievable at ~275 churches blended across tiers.

### 3.4 Free tier / trial strategy

- 30-day full-feature trial, no credit card required
- After trial: Starter tier auto-applies (no feature cutoff for CCM — child safety cannot be paywalled)
- Annual discount of ~17% (two months free) to encourage lock-in

---

## 4. Three-Phase Build Plan

### Phase 1 — Match (Months 1–6)

**Goal**: A church using Planning Center People + Giving + Check-Ins can switch to ChurchForge with zero feature regression.

---

#### 1.1 Online Giving

**Why first**: Giving is the #1 reason churches buy software. Without it, ChurchForge cannot be a church's primary system.

**Features to build**:
- Stripe Connect integration (church receives funds directly to their Stripe account)
- One-time and recurring giving with ACH + card
- Giving by fund (General, Building, Missions, etc.) mapped to GL accounts
- Mobile-optimized giving page (`give.churchforge.com/churchname` or embedded widget)
- Donor-facing giving history and tax statements (PDF)
- Giving auto-posts to Finance GL: debit Asset (checking), credit Income (fund) — zero manual entry
- Pledge campaigns with progress tracking and auto-email reminders
- Lapsed donor alert (no gift in 60/90 days)
- Failed payment retry with guardian notification

**Architecture notes**:
- `stripe_connect_accounts` table per tenant
- `donations` table (already exists) extended with `stripe_payment_intent_id`, `stripe_charge_id`
- `donation_allocations` table for split-fund giving
- GL posting server action triggered on `payment_intent.succeeded` webhook
- Giving page is a public route — no auth required

---

#### 1.2 Member PWA

**Why second**: Members need self-service access. Without it, every update goes through staff.

**Features to build**:
- Progressive Web App installable on iOS + Android
- Member login (Supabase Auth magic link or email/password)
- Giving dashboard: history, recurring management, tax statement download
- Directory: opt-in searchable member directory
- Profile self-update: photo, address, phone, family members
- Push notifications: announcements, group messages, event reminders
- Offline-capable (service worker caches giving history, directory)

**Architecture notes**:
- `app/member/` route tree (separate from `/app/church-admin/`)
- Member role RLS policies (can see own data + directory opt-ins)
- `web-push` for notifications (VAPID already planned for CCM silent page)

---

#### 1.3 Small Groups

**Why third**: Groups are the primary discipleship and community structure in 80%+ of US evangelical churches.

**Features to build**:
- Group directory with categories (life stage, geography, interest, day/time)
- Group roster with leader and co-leader roles
- Attendance tracking per meeting (present / absent / excused)
- Group messaging (in-app + email digest)
- Resources tab: attach files, links, study guides
- Group creation request workflow (leader proposes → admin approves)
- Attendance trends dashboard (admin view: which groups are growing/declining)

**Architecture notes**:
- `groups`, `group_members`, `group_meetings`, `group_attendance`, `group_resources` tables
- Group leader role — can manage their own group, cannot see other groups' data
- RLS: group_members can read group data; only leaders can write

---

#### 1.4 Email + SMS Communications

**Why fourth**: Every operational feature (events, groups, giving reminders) depends on outbound communication.

**Features to build**:
- Announcement composer with rich text and image embed
- Audience targeting: all members, by group, by tag, by role, custom filter
- Email send via SendGrid (transactional) or Resend (simpler API)
- SMS send via Twilio (opt-in required, TCPA-compliant)
- Scheduled send (send Sunday morning at 9am)
- Open/click tracking (email only)
- Unsubscribe management with compliance (CAN-SPAM / TCPA)
- Communication history log per member

**Architecture notes**:
- `communications`, `communication_recipients`, `communication_events` tables
- Webhook receivers for SendGrid/Twilio delivery events
- `member_communication_prefs` for opt-in/opt-out per channel

---

#### 1.5 Event Registration

**Why fifth**: VBS, conferences, retreats, membership classes — every church runs events that need sign-up.

**Features to build**:
- Event creation: title, date/time, location, capacity, registration deadline
- Registration form with custom fields (dietary, t-shirt size, emergency contact)
- Paid events via Stripe (tickets + optional add-ons)
- Waitlist when capacity reached
- Check-in QR code per registrant (integrates with CCM kiosk pattern)
- Export attendee list (CSV/PDF)
- Auto-email confirmation + reminder (1 week + 1 day before)
- Cancellation + refund workflow

---

#### 1.6 Attendance Tracking

**Why sixth**: Pastoral care depends on spotting declining attendance before a member disengages entirely.

**Features to build**:
- Service attendance by date (headcount + individual)
- Individual attendance history (last 52 weeks sparkline)
- Volunteer-submitted attendance via mobile (room count or individual scan)
- Attendance trends: YoY comparison, seasonal patterns
- Absence alert: member misses 3+ consecutive services → pastoral follow-up task created
- Integration with Check-Ins (CCM check-in auto-populates service attendance for children)

---

### Phase 2 — Compete (Months 7–12)

**Goal**: ChurchForge is the preferred choice for churches evaluating a switch. Feature parity is complete; differentiators begin.

---

#### 2.1 Volunteer Scheduling

**Features to build**:
- Service plan builder: list positions needed per service (worship leader, 3 singers, soundboard, 2 greeters)
- Volunteer pool per position (assigned from member directory)
- Scheduling with conflict detection (double-booked, blocked dates)
- Automated scheduling (fill positions from pool, rotating fairly)
- Volunteer confirmation / decline workflow
- Substitute request when a volunteer declines
- Volunteer hours tracking for annual recognition

---

#### 2.2 Member Self-Service Portal

**Features to build**:
- Full profile management (photo, family, contact info)
- Household management (link spouse + children to one giving unit)
- Giving: full history, recurring management, pledge status, tax statement
- Groups: browse, request to join, see upcoming meetings
- Events: browse upcoming, register, manage registrations
- My Activity: service attendance history, group attendance, volunteer history
- Prayer request submission (private to pastoral team or public to small group)

---

#### 2.3 Custom Forms

**Features to build**:
- Form builder: text, email, phone, date, dropdown, checkbox, file upload fields
- Required field and validation rules
- Conditional logic (show field X if answer to Y is Z)
- Payment field (Stripe integration)
- Form embedding on external church website
- Submission notifications (email to staff)
- Submission data table with CSV export
- Workflow trigger: form submission creates a follow-up task

---

#### 2.4 Giving Analytics Dashboard

**Features to build**:
- Total giving trend (monthly/quarterly/annual)
- Donor retention rate: what % of last year's donors gave again this year
- New donor acquisition: first-time givers per month
- Lapsed donor count: gave last year, not this year
- Average gift size trend
- Giving by fund (pie + trend)
- Pledge campaign progress: total pledged vs. received vs. outstanding
- Weekly velocity: on-pace to hit budget vs. below pace (traffic-light indicator)
- Top donor summary (admin-only, anonymized in public reports)

---

#### 2.5 First-Visit Workflows

**Features to build**:
- Guest capture at check-in or via QR card at welcome desk
- Automated follow-up sequence:
  - Day 1: welcome email from lead pastor (personalized template)
  - Day 7: invitation to a next step (small group, membership class)
  - Day 14: staff call prompt (task created for follow-up team)
  - Day 30: lapsed guest alert if no second visit
- Workflow editor: configure steps, timing, messages per workflow
- Guest pipeline view: all first-time visitors with current workflow stage
- Conversion tracking: guest → member conversion rate

---

#### 2.6 Background Check Integration

**Features to build**:
- Checkr or Ministrysafe integration for volunteer background checks
- Request check via in-app link (sends email to volunteer)
- Status sync: pending / clear / review / declined
- Automatic block: volunteer cannot be assigned to child-contact role if check is expired or failed
- Annual renewal reminders (90/60/30 days before expiry)
- Clearance summary report for insurance audits

---

### Phase 3 — Win (Months 13–24)

**Goal**: ChurchForge is the only system churches consider. Competitors cannot match the architecture or partnerships.

---

#### 3.1 Giving → GL Auto-Posting (Already partially built — complete it)

**What remains**:
- Fund-to-account mapping UI (Finance admin maps each giving fund to a GL income account)
- Stripe webhook → server action that creates `finance_journal` + two `finance_journal_lines` in one transaction
- Reconciliation report: Stripe payouts vs. GL postings (finds any gap)
- Batch daily posting mode (optional: accumulate intraday, post at midnight)
- Year-end audit report: all giving journal entries in IRS-presentable format

**Why this wins**: No competitor at under $500/mo has this. A church bookkeeper currently spends 4–8 hours/month manually importing Stripe/Planning Center exports into QuickBooks. This eliminates that entirely.

---

#### 3.2 AI Pastoral Insights

**Features to build**:
- Engagement score per member (composite: attendance, giving frequency, group participation, volunteering)
- Declining engagement alert: score drops 20%+ over 90 days → pastoral care task created
- Seasonal pattern detection: member typically gives in December — no gift yet in Q4 → prompt
- New family milestone detection: child born (inferred from CCM new registration) → suggest parenting small group
- Group health score: groups with low attendance, no leader activity, or no recent meetings flagged for follow-up
- AI pastoral summary: weekly email digest to lead pastor: "3 members at risk, 2 milestones this week, 1 group needs attention"
- Natural language query: "show me members who attended in January but haven't been back" (plain English → filtered list)

**Privacy constraints** (non-negotiable):
- All inference runs server-side against the tenant's own data only
- No data crosses tenant boundaries
- No member data is sent to third-party AI APIs — inference uses Anthropic API with zero data retention policy
- Insights are suggestions, not scores displayed to members
- AI_ASSISTIVE_DISCLAIMER shown on all AI-surfacing views

---

#### 3.3 Denomination and Network Oversight Dashboard

**Features to build**:
- Multi-church parent account (denomination, district, network)
- Aggregate giving trends across all affiliated churches
- CCM compliance dashboard: which churches have active CCM, two-adult rule enabled, background check current
- Ministry track progress aggregate: denomination-wide discipleship funnel
- Incident report visibility (denomination can see anonymized incident trends, not PII)
- Financial health indicators: budget vs. actual across all churches (with church permission)
- Announcements from denomination to all affiliated churches
- Centralized volunteer background check negotiated rates

**Architecture notes**:
- `denomination_accounts` table (parent level above `churches`)
- Permission model: denomination_admin can request read access, church must approve per-category
- Separate route tree: `/app/denomination-admin/`
- Aggregation queries run against Platform DB metadata + federated calls to tenant DBs

---

#### 3.4 Insurance Carrier CCM Partnership

**The opportunity**: Church liability insurance underwriters (Church Mutual, GuideOne, Brotherhood Mutual) require documented child safety policies. Most churches have paper policies that are never audited. ChurchForge CCM generates a live, verifiable compliance record.

**What to build**:
- Compliance report export: PDF/JSON showing for any date range: incident count, two-adult rule compliance %, background check currency, custody restriction log (anonymized), check-in/checkout audit trail
- Insurance carrier API (future): direct compliance score feed to carrier for automated premium calculation
- Church certification badge: "ChurchForge CCM Certified — [Year]" for church website

**Partnership ask to carriers**:
- Carriers offer 5–15% premium discount for churches using ChurchForge CCM with two-adult enforcement and background check integration
- ChurchForge gets co-marketing and preferred vendor listing
- Carrier gets documented risk reduction and differentiated product offering

**Why no competitor can match this**: Planning Center Check-Ins has no custody restriction tracking, no two-adult enforcement, and no incident reporting tied to insurance-grade documentation. This is ChurchForge's structural moat.

---

#### 3.5 Advanced Financial Management

**Features to build** (extending the existing Finance GL):
- Bank feed import (Plaid or CSV) with AI-assisted transaction categorization
- Accounts payable: vendor invoices, approval workflow, payment scheduling
- Multi-fund budget with board approval workflow
- Financial statement generation: Balance Sheet, P&L, Cash Flow Statement (IRS Form 990-ready)
- Audit support package: export all journal entries, supporting documentation links, reconciliation reports
- Multi-campus / multi-entity consolidation (for large churches with related entities)
- Donor-restricted fund tracking: ensure restricted gifts are only spent on designated purpose

---

#### 3.6 COPPA Compliance Engine

**Features to build**:
- Automatic age calculation at check-in registration — children under 13 flagged as COPPA-subject
- Data minimization report: surfaces which COPPA-subject records hold more data than necessary
- Retention schedule engine: auto-flag CCM records older than 7 years for review/purge
- Annual PII review workflow: admin prompted each January to review children's sensitive data
- Parental consent workflow: digital consent form for any data collection on children
- Right-to-deletion workflow: parent requests deletion → staff reviews → compliant purge with audit record
- COPPA disclosure template: generates required privacy notice for church website

**Why this wins**: No competitor has this built-in. Privacy lawyers reviewing church software will recommend ChurchForge to every client.

---

## 5. Technology Bets

| Investment | Rationale |
| --- | --- |
| Supabase silo model (per-tenant DB) | No shared-schema cross-tenant breach possible. Insurance carriers and denomination IT teams require this. |
| Anthropic API with zero-retention clause | AI insights without being a PHI/PII liability. |
| Stripe Connect | Churches never touch ChurchForge money. Zero payment processing liability. |
| bcrypt PIN hashing | The only correct security architecture for child check-in PINs. Structural competitive advantage. |
| Vercel + Supabase (no self-managed infra) | Keeps the team focused on product, not ops. Both platforms have 99.9%+ SLA. |

---

## 6. Go-to-Market Strategy

### 6.1 Target customer profile

- Primary: Churches with 100–1,000 average attendance
- Currently using: Planning Center (frustrated by cost), Breeze (outgrowing it), spreadsheets + ChurchTrac
- Buyer: Church administrator or executive pastor
- Champion: Children's ministry director (CCM compliance is emotional; safety is personal)

### 6.2 Acquisition channels

1. **CCM insurance partnership** — carrier refers ChurchForge to every church renewing liability policy
2. **Denomination endorsement** — pitch district leaders on the oversight dashboard; they recommend to every affiliated church
3. **Organic content** — "How to run child check-in safely" / "Church financial controls for small churches" — targets searchers actively comparing software
4. **Planning Center migration tool** — one-click import of PC People + Giving export. Removes friction from the #1 objection ("our data is in Planning Center")
5. **Free trial + self-serve onboarding** — 30-day trial, guided setup, no sales call required for Starter/Growth

### 6.3 Retention strategy

- **Giving lock-in**: Once a church's donor history is in ChurchForge, migration cost is high (donor records, recurring giving setups)
- **GL lock-in**: 3+ years of journal entries is not easily migrated
- **CCM lock-in**: Incident reports, custody restrictions, check-in history — churches cannot lose this for liability reasons
- **Annual contract discount**: 2 months free on annual billing locks in a year at a time

---

## 7. What We Will Never Do

- **Website builder**: Squarespace and Wix are better. We integrate, we don't replicate.
- **Streaming / media hosting**: Vimeo and YouTube are better. We link, we don't host.
- **Payroll**: ADP and Gusto are better and carry payroll liability we don't want.
- **Shared tenant database**: The security and compliance moat depends on the silo model.
- **Freemium child check-in**: Child safety features are never paywalled. They are in every tier.

---

## 8. Success Metrics

| Metric | 6-month target | 12-month target | 24-month target |
| --- | --- | --- | --- |
| Active churches | 25 | 100 | 400 |
| MRR | $2,000 | $8,000 | $40,000 |
| Churn rate | < 5%/mo | < 3%/mo | < 2%/mo |
| NPS | > 40 | > 50 | > 60 |
| CCM active churches | 100% of subscribers | 100% | 100% |
| Giving volume processed | $500K | $5M | $50M |

---

*This document is the product strategy source of truth. All feature prioritization decisions should reference this document. Update it when strategy changes — do not let it drift from what is actually being built.*
