# Spanish UI Coverage Plan

This plan tracks the rollout from partial Spanish support to full UI translation coverage across ChurchCore Ops.

## Goal

Every user-facing UI string should render in English or Spanish based on the `churchcore_ops_locale` cookie and the in-app language selector. Church-entered content remains in the language entered by the church, including names, notes, event titles, fund names, addresses, emails, phone numbers, pastoral records, and imported finance/accounting data.

## Translation Rules

- Use `lib/i18n.ts` namespaces for product UI copy.
- Use `useI18n()` in Client Components.
- Pass plain serializable labels from Server Components to Client Components.
- Format dates, numbers, and currency with the selected locale where the UI owns the formatting.
- Keep operational data, seed data, emails, names, addresses, notes, ministry names, event names, fund names, and uploaded/imported data unchanged unless it is explicit product copy.
- Translate notifications, form labels, placeholders, empty states, badges, table headers, tabs, modal titles, and call-to-action buttons.
- Update this plan plus `README.md`, `CHANGELOG.md`, and relevant docs as meaningful surfaces move to Spanish-ready status.

## Current Spanish-Ready Surfaces

- Shared application shell and language selector
- Public home page
- Sign-in page and preview account entry
- Public portal landing and registration request form
- Member home page, directory, family detail page, bottom navigation, profile editor, family editor, and notification preferences form
- Daily Desk
- ChurchAdmin default navigation
- ChurchAdmin home dashboard summary cards
- ChurchAdmin home operations lanes
- ChurchAdmin weekly Readiness path
- ChurchAdmin portal account approval queue
- ChurchAdmin church settings page
- ChurchAdmin people management page, including add, invite, edit, bulk, and relationship controls

## Remaining Surface Queue

Priority 1: MVP tenant workflows

- Member schedule, giving, groups, ministries, and data-rights surfaces
- ChurchAdmin Events list/detail/create workflows
- ChurchAdmin Giving Ops and Donations dashboards
- ChurchAdmin Reports
- ChurchAdmin Communications
- ChurchAdmin Volunteers and service schedules
- ChurchAdmin Visitors pipeline
- ChurchAdmin Suggested Workflows

Priority 2: Finance and specialized modules

- Finance dashboard, accounts, journals, budgets, imports, and reports
- Children’s Ministry dashboard, check-in/checkout, services, rooms, incidents, volunteers, and settings
- Public parent children session check-in/checkout routes, including guardian verification and pickup-code checkout labels
- Ministry Forge index/detail pages and all specialized ministry track panels
- Attendance and Small Groups
- Calendar

Priority 3: platform and supporting surfaces

- Control Plane
- Launch checklist
- Public giving page
- Notification toasts across remaining workflows
- Transactional emails and receipt templates where user-facing
- Error messages from server actions where shown directly in the UI

## Verification

For each converted chunk:

- Run `npm run lint`.
- Run `npm run build`.
- Spot-check the converted route with `churchcore_ops_locale=es`.
- Confirm at least the main page title, primary controls, filters/actions, and empty/success/error states are Spanish.

Before declaring full Spanish readiness:

- Run a repo-wide hard-coded UI string scan.
- Review false positives such as tests, metadata, identifiers, seed data, domain-specific user-entered sample data, and protocol constants.
- Smoke test key routes in English and Spanish.
