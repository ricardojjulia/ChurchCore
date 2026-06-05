# ChurchCore Demo Guide

Welcome. This document is written for church staff and evaluators who want to explore ChurchCore without any technical setup. Everything runs in your browser.

---

## Getting access

Open the demo in any modern browser — no software installation required:

**[https://church-core-ops.vercel.app](https://church-core-ops.vercel.app)**

---

## Demo credentials

All five accounts use the same password: **ChurchCoreDemo2026!**

| Role | Email | What you can see and do |
|------|-------|------------------------|
| Church Administrator | admin@graceharbor.church | Full dashboard, readiness checklist, all admin screens, finance, reports, settings |
| Member / Volunteer | member@graceharbor.church | Member portal, personal giving history, group membership, event RSVP, check-in |
| Secretary / Office Admin | secretary@graceharbor.church | Daily desk, task queue, account approval, calendar coordination |
| Pastor / Elder | pastor@graceharbor.church | Care assignments, pastoral notes, ministry oversight, prayer tools |
| Ministry Leader | leader@graceharbor.church | Ministry Forge, volunteer scheduling, service plan, group management |

The demo church is **Grace Harbor Church**. All data is pre-seeded and resets on request.

---

## Suggested tour

Follow these numbered steps to see the most meaningful parts of the platform in about 30 minutes.

### 1. Sign in as the church administrator

Use **admin@graceharbor.church** and the shared password.

You will land on the Admin Dashboard. Notice the Weekly Readiness panel at the top — it shows the live state of every operational lane: account requests, people gaps, events, children's ministry, volunteers, giving, communications, and reports. Each tile is colored by urgency. This is the starting point for a church administrator each week.

### 2. Walk the weekly readiness checklist

Click each readiness tile in order:

- **Portal account requests** — three requests are pending (two new visitors and one member match). The system has already detected which request belongs to an existing profile.
- **People and households** — two profiles are missing emergency contact information and one member has no household assignment. Click through to the people list filtered to the issue.
- **Weekend events** — the upcoming Sunday service has a roster position not yet confirmed. The youth night is pending approval.
- **Children's ministry** — an active service is open with two assigned volunteers (satisfying the two-adult safety rule) and one follow-up incident that needs attention.
- **Volunteer schedule** — the service plan has two confirmed positions and one pending response.
- **Giving and finance** — two donations have no GL post (fund mapping needed), one draft journal is waiting for review, and there is one failed gift.
- **Communications** — two sends are delivered, one failed, one bounced, and one contact is suppressed.
- **Reports** — attendance trend for the last eight Sundays is visible, along with giving data.

### 3. Approve a portal account request

From the readiness panel, click the **Portal account requests** tile. You will see three pending requests. Click one and choose Approve. The member's account becomes active and they can now sign in.

### 4. Switch to the member view

Sign out, then sign back in as **member@graceharbor.church**.

You will land in the Member Portal — a simplified view designed for a phone or tablet. Explore:

- Your giving history and year-to-date total
- The groups you belong to
- Upcoming events you are registered for
- Your personal profile and contact preferences

### 5. Review children's ministry safety

Sign back in as admin. Open the **Children's Ministry** section from the navigation. You will see:

- The active service with three checked-in children
- Two assigned volunteers covering the Nursery room (the two-adult rule is satisfied and shown as green)
- One open incident report for Emma Thompson — marked for follow-up

This section is designed to help the children's director confirm coverage and safety state without paperwork.

### 6. Post a donation to the general ledger

Go to **Giving** in the admin navigation. You will see six donation records in different states:

- Two succeeded donations with no GL post — these are waiting for a fund mapping
- One failed donation
- One pending payment
- Two succeeded donations with receipts sent

Click the **Finance** tab to see the two journals: one draft payroll journal (waiting for review) and one posted giving batch. Click **Post** on the draft journal to move it to posted status.

### 7. Review the communications hub

Open **Communications**. You will see a log of five messages in different delivery states: sent, queued, failed, and bounced. One email address is also marked as suppressed (the contact unsubscribed).

Click the failed send to see the error detail and options to retry or remove the contact.

### 8. Try the people import

From the **People** section, open the **Import** panel. Upload the sample CSV below to see the dry-run preview — the system will classify each row as create, update, skip, or reject and explain why before you commit anything.

### 9. View ShepherdAI suggested workflows

Open **Workflows** from the sidebar. Two AI-suggested workflows are waiting:

- Visitor follow-up: Talia Grant submitted a portal request 24 hours ago
- Volunteer coverage gap: the Greeter position for next Sunday still has a pending response

Click either workflow to assign it, act on it, or dismiss it.

### 10. Try the public giving page

Open a new browser tab and go to:

```
https://church-core-ops.vercel.app/give/grace-harbor
```

This is the public-facing giving page for Grace Harbor. Anyone with the URL can give without signing in. Try selecting a fund and entering a test amount. No real card is charged in demo mode.

---

## Sample CSV for the people import demo

Copy and save this as `sample-members.csv`, then upload it in the People import screen.

```csv
first_name,last_name,email,phone,membership_status,family_name
Jordan,Wallace,jordan.wallace@example.com,555-4001,active,Wallace Household
Priscilla,Monroe,priscilla.monroe@example.com,555-4002,visitor,Monroe Household
Derek,Sutton,derek.sutton@example.com,,active,Sutton Household
Carmen,Ibarra,carmen.ibarra@example.com,555-4004,visitor,
```

The import engine will:

- Classify Jordan and Derek as **create** (new members)
- Flag Carmen as **create** with a warning that she has no household assignment
- Classify Priscilla as **create** (new visitor)
- Show a preview before you commit anything

---

## What you are evaluating

ChurchCore is designed for churches that have outgrown spreadsheets and disconnected tools. The key things to look for during the demo:

**Operational clarity.** The weekly readiness view gives the administrator a single place to see every open issue across the church, not just one department.

**Role-based access.** Each login shows a different view of the same data. The secretary cannot see pastoral care notes. The member sees only their own giving history. Access is enforced on the server, not just in the UI.

**Children's ministry safety.** The two-adult rule, incident reporting, and guardian pickup tracking are built in — not bolted on.

**Double-entry finance.** Donations flow through a real general ledger with fund mapping, journal posting, and a budget. Nothing is faked.

**Idempotent data operations.** The people import, giving import, and events import all show a dry-run preview before committing. Re-importing the same file does not create duplicate records.

**AI-assisted workflows.** ShepherdAI suggests follow-up actions based on real activity — new visitors, coverage gaps, and at-risk connections — without replacing human judgment.

---

## Questions

Contact the ChurchCore team at the email address provided with your demo invitation.
