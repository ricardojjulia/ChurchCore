# Vendor import fixtures (G4.1)

Synthetic data only: invented people, `@example.org` addresses and made-up
amounts. No file here is a real export, and none is copied from a vendor.

Neither Planning Center nor Breeze documents the exact header row of its
CSV exports. Each file below is labelled by how much of its header row we could
check, so nobody mistakes a plausible guess for a confirmed format.

Labels:

- **VERIFIED template**: the headers match a template or import format the
  vendor's own help centre describes (Breeze people/giving/attendance/tags
  import templates, support.breezechms.com).
- **PARTIAL (third-party corroborated)**: the headers match what independent
  open-source tools that read real exports expect (ChurchApps B1Transfer
  `ExportPlanningCenterZipHelper` / `ImportPlanningCenterZipHelper`, an OCM
  migration script), but the vendor does not document them.
- **UNVERIFIED**: the headers are our best reading of the vendor's field
  names (for example the Planning Center donation-history import fields) or are
  invented for the test. The vendor's export may differ.

| File | Label | Basis |
| --- | --- | --- |
| `planning-center/people.csv` | PARTIAL (third-party corroborated) | full People export header as read by B1Transfer; one row per person, household by Household ID/Name |
| `planning-center/people-bom-blank-rows.csv` | UNVERIFIED | Edge case: UTF-8 BOM, CRLF line ends, trailing comma-only and blank rows |
| `planning-center/people-duplicate-headers.csv` | UNVERIFIED | Edge case: the same header (`Home Email`) twice |
| `planning-center/giving.csv` | UNVERIFIED | Planning Center documents the donation-history *import* fields (Donation amount, Received date, Fund, Remote ID, ...); the *export* columns are user-selectable and undocumented |
| `planning-center/events.csv` | UNVERIFIED | Calendar/events CSV headers are not documented |
| `breeze/people.csv` | VERIFIED template | Breeze people import template plus the `Breeze ID` first column of its export; `Email` holds several comma-separated addresses |
| `breeze/giving.csv` | VERIFIED template | Breeze "Generic" giving import: Breeze ID (or `Anonymous`), Processor ID, Date mm/dd/yyyy, plain-number Amount, one fund per row |
| `breeze/attendance.csv` | VERIFIED template | Breeze attendance import: Breeze ID (or `Anonymous`), Event Name, Date `mm/dd/yy[yy]` with an optional time such as `10:30am`, Count |
| `breeze/tags.csv` | VERIFIED template | Breeze tags import: Breeze ID, Tag Name as `Folder>>Tag` |
| `breeze/events.csv` | UNVERIFIED | Breeze exports events only through its API (`start_datetime`); this file is a spreadsheet stand-in so attendance has events to match |

Each fixture also carries rows that must be handled safely rather than
imported: zero and negative gift amounts, an `Anonymous` donor and head-count,
a Breeze ID nobody has, an event name no event has, and repeated identical
rows.

Used by `lib/*-import-*.test.ts` (parsing and classification) and
`tests/e2e/import-vendor-fixtures.spec.ts` (full import against local
Supabase, in the order people, events, giving, attendance, tags).
