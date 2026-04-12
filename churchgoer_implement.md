# ChurchForge - Churchgoer Data Management Plan

**Living Document** - Last Updated: April 11, 2026  
**Filename**: `churchgoer_data.md`  
**Version**: 1.0  
**Purpose**: This is the single source of truth for all **churchgoer** (member / attendee / volunteer) data handling in ChurchForge. It details how churchgoer information is added, maintained, searched, and used across the system, plus the complete design for the **Churchgoer Portal** (self-service web experience optimized for mobile devices).

This document must be referenced in every GitHub Issue, PR, or task that touches member profiles, directory, or the member-facing portal. It directly extends **DEVELOPMENT_PLAN.md** sections 2 (User Roles), 3 (Core Features), 5 (Calendar), 7 (Security & Privacy), and Sprint 1.

## Table of Contents

- [1. Churchgoer Definition & Scope](#1-churchgoer-definition--scope)
- [2. Data Model & Schema](#2-data-model--schema)
- [3. Adding & Maintaining Churchgoer Information](#3-adding--maintaining-churchgoer-information)
- [4. Search & Directory Features](#4-search--directory-features)
- [5. Churchgoer Usability & Integration](#5-churchgoer-usability--integration)
- [6. Churchgoer Portal Page (Self-Service Web Experience)](#6-churchgoer-portal-page-self-service-web-experience)
- [7. Mobile-First Design & Consumption](#7-mobile-first-design--consumption)
- [8. Security, Privacy & Compliance (PII)](#8-security-privacy--compliance-pii)
- [9. Implementation Tasks & Sprint Integration](#9-implementation-tasks--sprint-integration)
- [10. How to Use This Document](#10-how-to-use-this-document)

## 1. Churchgoer Definition & Scope

A **Churchgoer** is any person who:

- Attends services or events
- Is a registered member or regular attendee
- May serve as a volunteer
- Has a profile in the system (role = `member_volunteer` by default)

Churchgoers **do not** have admin or leadership privileges unless explicitly promoted. They own their own data and can self-service most actions.

## 2. Data Model & Schema

All churchgoer data lives in the existing `profiles` table (from Sprint 1) with the following extensions:

```sql
-- Extended Profiles table
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists family_id uuid references families(id);
alter table public.profiles add column if not exists preferred_contact_method text check (preferred_contact_method in ('email','sms','app','none'));
alter table public.profiles add column if not exists emergency_contact_name text;
alter table public.profiles add column if not exists emergency_contact_phone text;
alter table public.profiles add column if not exists notes text;           -- visible only to ChurchAdmin / Pastor
alter table public.profiles add column if not exists last_attendance timestamptz;
alter table public.profiles add column if not exists membership_status text check (membership_status in ('active','inactive','visitor','baptized','transferred')) default 'active';
alter table public.profiles add column if not exists joined_date date default current_date;
alter table public.profiles add column if not exists directory_visible boolean default true;
alter table public.profiles add column if not exists contact_allowed boolean default true;

-- Families (for household grouping)
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references churches not null,
  family_name text not null,
  address text,
  home_phone text,
  created_at timestamptz default now()
);

-- Attendance tracking
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  event_id uuid references events(id),
  checked_in_at timestamptz default now(),
  status text check (status in ('present','absent','excused'))
);
```

Key fields for churchgoers:

- Full name, email, phone, address, avatar
- Ministry memberships (via `profile_ministries`)
- Role = `member_volunteer` (locked for self-service users)

## 3. Adding & Maintaining Churchgoer Information

**ChurchAdmin / Pastor flow (admin-only):**

- Bulk import via CSV (name, email, phone, date_of_birth, family grouping)
- Single-add form with family selector
- Edit modal with all fields + private notes
- Quick actions: Mark as inactive/visitor, merge duplicates
- Mass updates (e.g., update membership status for a group)

**Self-service flow (churchgoer portal):**

- Churchgoer can update their own profile: name, phone, address, avatar, preferred contact method, emergency contact, and directory visibility
- Cannot change role, membership_status, notes, or pastoral fields

**Automated maintenance:**

- Last attendance automatically updated when checking into events
- System generates monthly "profile completeness" score and gentle nudges

## 4. Search & Directory Features

**Church Directory (visible to all logged-in churchgoers):**

- Global search bar (name, ministry, family)
- Filters: Ministry, Membership Status, Has Photo, Age range
- Results displayed as beautiful cards on mobile and table on desktop
- Click any card to view limited public profile

**Advanced search (ChurchAdmin / Pastor only):**

- Full-text search across all fields
- Saved filters (e.g., "Inactive Members", "New Visitors")
- Export to CSV or PDF

**Privacy controls:**

Each churchgoer can toggle:

- "Show my phone/email in directory"
- "Allow other members to contact me"
- "Include me in the public church directory"

## 5. Churchgoer Usability & Integration

Churchgoer data powers the following system features:

- Personalized calendar ("My Events" + "My Ministries" filters)
- Ministry rosters and volunteer matching
- RSVP and attendance tracking
- Targeted communications (opt-in only)
- Engagement reporting and dashboards

## 6. Churchgoer Portal Page (Self-Service Web Experience)

**Route**: `/portal` (default landing page for `member_volunteer` role)

**Layout (clean, welcoming, mobile-first):**

- Top navigation: Church logo, user greeting, avatar, logout
- Bottom navigation bar on mobile (Home, Calendar, Ministries, Directory, Profile)
- Left sidebar on desktop

**Main Sections:**

- **Home** – Personalized welcome, next 3 upcoming events with one-tap RSVP, quick church links, announcements
- **Calendar** – Full categorized calendar with smart default filters
- **My Ministries** – Cards showing joined ministries, leaders, and open volunteer opportunities
- **Directory** – Searchable member directory
- **Profile** – Full self-service editing + data export/delete request
- **Resources** – Links to website, sermons, giving, social media, documents

## 7. Mobile-First Design & Consumption

- Fully responsive design using Tailwind + Mantine UI
- Progressive Web App (PWA) support – churchgoers can "Add to Home Screen"
- Touch-optimized buttons and calendar
- Offline caching of upcoming events and personal profile
- Dark mode support
- Large tap targets and accessible fonts for all ages
- **Testing requirement**: Every screen must pass real mobile device testing before merging

## 8. Security, Privacy & Compliance (PII)

- Strict Row Level Security (RLS) – churchgoers only see their own church's data
- Sensitive fields (`notes`, `emergency_contact_name`, `emergency_contact_phone`) visible only to ChurchAdmin and Pastors
- All PII encrypted at rest and in transit
- Full audit logging of any admin access to churchgoer profiles
- Self-service "Export My Data" (JSON) and "Request Account Deletion" (soft delete with admin approval)
- Explicit consent required on first login for data usage and communications

## 9. Implementation Tasks & Sprint Integration

**Sprint 1 Extensions:**

- Add new columns to `profiles` table
- Implement basic self-service profile editing

**Sprint 2 Priorities:**

- Build complete `/portal` layout and all tabs
- Implement searchable Directory
- Add family grouping and CSV bulk import

**Sprint 3:**

- Attendance tracking
- PWA configuration and offline support

**Task Checklist:**

- [ ] Extend Supabase schema (`profiles` + `families` + `attendance`)
- [ ] Create self-service profile update actions
- [ ] Build `/portal` pages with bottom navigation
- [ ] Implement directory search with filters and privacy toggles
- [ ] Add mobile PWA manifest and service worker
- [ ] Write comprehensive RLS policies
- [ ] Create admin CSV import functionality

**Acceptance Criteria:**

- Churchgoers can fully manage their own information
- Admins can efficiently add and maintain rich member records
- Mobile portal feels native and easy to use
- All data remains properly isolated and private

## 10. How to Use This Document

1. Open this file before any work touching member profiles, directory, or the churchgoer portal.
2. Reference relevant sections in every issue and PR.
3. Update this document only through PR when scope changes.
4. All new fields must go through the PII review checklist in Section 8 before being added to the schema.
5. Treat it as the member data constitution — keep it visible during active development.
