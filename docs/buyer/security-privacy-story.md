# ChurchCore — Security and Privacy Story

**Audience:** Church administrators, board members, and pastoral leadership  
**Updated:** 2026-06-02  
**Classification:** Buyer-facing — may be shared with governing boards and insurance reviewers

---

## Your Data Stays Yours

Every church on ChurchCore runs in a completely separate, isolated environment. Your member records, giving history, children's files, and pastoral notes are scoped to your church account and cannot be read, accessed, or combined with any other church's data — ever.

This is not a software policy that could be misconfigured. It is enforced at the database level for every table that holds your data. Each record is tagged to your church, and the system rejects any query that would return data across that boundary. If a technical problem ever occurred with another church's account, it could not expose your records.

Your data is not sold, shared with advertisers, or used to train third-party AI systems. ChurchCore is a software tool — you are the customer, not the product.

---

## Child Safety Is Built In

ChurchCore's children's ministry module was designed around safe-church principles, not added as an afterthought.

**Session-controlled check-in.** A parent cannot check a child in from their phone unless a staff member has explicitly opened that day's session. Sessions close when staff closes them, and closed session links stop working immediately. A link from last Sunday cannot be reused this Sunday.

**Custody restrictions and authorized pickups.** Custody restrictions are stored per child and surface automatically at check-in and checkout. Staff see custody alerts before completing a pickup. Only people listed as authorized pickups can receive a child, and the system enforces this even in a busy lobby.

**Two-adult coverage.** ChurchCore tracks whether each room meets your two-adult safety requirement before a session can open. If a room is not covered, the session cannot be enabled — unless a staff member records an explicit override with a documented reason.

**Incident logging.** Any incident — injury, behavior concern, or allergy response — is logged in the system with timestamp, staff name, and notes. Records are preserved and searchable for insurance, denominational review, or parent follow-up.

**Audit trail.** Every check-in, checkout, and safety override carries a permanent record of who performed the action and when. If your insurance carrier or denomination asks for documentation, the records are there.

---

## Financial Integrity

Every donation record in ChurchCore is permanent and auditable. Giving records cannot be deleted or altered without leaving a trace. Journal entries carry timestamps and staff identifiers.

**Role-gated finance access.** Only users with the Church Administrator role can access giving records, fund mappings, GL accounts, journal drafts, and financial reports. Pastors, secretaries, ministry leaders, volunteers, and members cannot see financial data unless the administrator explicitly grants elevated access.

**Fund mapping and general ledger.** Every donation is mapped to a named fund, and every fund maps to a GL account. There is no separate accounting system to reconcile — the ledger is part of the same system where donations are recorded.

**No platform fees on donations.** ChurchCore does not take a percentage of donations. The full amount of every gift goes to your church. Payment processing fees from Stripe (the payment processor) apply as they would with any card transaction, but ChurchCore itself takes nothing.

**Tax receipt documentation.** Giving statements and donation receipts are generated from the same records that feed the ledger — no re-entry, no manual reconciliation at year-end.

---

## Who Can See What

ChurchCore uses defined roles to control what each person can access. Here is a plain-language summary:

**Church Administrator** — Full access to all church records: people, giving, finance, events, children's ministry, volunteers, communications, and reports. This role is appropriate for your office manager or executive pastor. It should be assigned to the fewest people necessary.

**Pastor** — Access to pastoral care records, people profiles, and communications. Pastors can approve or follow up on member care workflows. Pastors do not automatically have access to financial records unless the Church Administrator grants that access.

**Secretary** — Access to people records, event rosters, and basic communications. Secretaries can manage day-to-day people and calendar operations but do not have access to giving records, pastoral notes, or financial journals.

**Member** — Access only to their own profile, their family's records, their own giving history, and the church directory (for people who have opted in to directory visibility). Members cannot see other members' giving, pastoral notes, emergency contacts, or date of birth.

**Volunteer** — Access to their own schedule, service plan assignments, and the children's room roster when assigned. Volunteers cannot access financial records or other members' personal information.

Staff notes and administrative observations about individuals are never visible to regular members. Directory visibility is controlled by each member — a member who opts out does not appear in the searchable directory for other members.

---

## Your Rights

ChurchCore is built to support your congregation members' data rights.

**Data export.** Members can request a copy of their personal data through their account settings. Administrators can generate exports for any member on request.

**Deletion and erasure.** When a member requests that their personal information be removed, Church Administrators can run an erasure procedure that removes identifying information — name, address, phone, date of birth, emergency contacts — while preserving records required for financial or legal compliance. The erasure is logged with a timestamp and the administrator's name.

**Consent records.** ChurchCore keeps a permanent log of what each member has consented to — directory visibility, communications preferences, and contact permissions. These records are append-only: a change in preference creates a new record rather than erasing the old one, so there is always a clear history of what was agreed to and when.

**Communications preferences.** Members can unsubscribe from email or SMS communications at any time through a one-click link in any message. Unsubscribe requests are honored immediately and cannot be overridden by staff.

---

## How We Verify These Claims

We do not ask you to take our word for these protections. ChurchCore verifies them through automated checks on every release.

**Automated security scans.** Every code change is scanned for accidentally committed secrets (passwords, API keys) before it can be merged. Dependency security is reviewed against known vulnerability databases in the same automated pass.

**Smoke testing on every deploy.** After every production deployment, automated checks confirm that protected routes require authentication, that role boundaries are enforced, and that the system can complete key workflows without errors.

**Row-level security on all tenant tables.** Every table that holds your church's data is protected at the database level so that queries from one church cannot return another church's records. This is verified as part of each major release.

**Security assessment updated with each major release.** The internal security assessment is a living document, updated after each significant feature addition. New surfaces — import tools, registration workflows, communications features — are reviewed for role access, tenant boundary enforcement, and audit coverage before being released.

---

*Questions about security practices, data handling, or compliance documentation for your insurance carrier or governing board? Contact the ChurchCore team directly. We will provide the documentation you need.*

*This document reflects ChurchCore as of 2026-06-02.*
