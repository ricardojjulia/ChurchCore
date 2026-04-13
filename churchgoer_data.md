# ChurchForge - Churchgoer Data Management Plan

**Living Document** - Last Updated: April 12, 2026  
**Filename**: `churchgoer_data.md`  
**Version**: 1.1  
**Purpose**: This is the single source of truth for all churchgoer data handling in ChurchForge. It covers how churchgoer information is collected, maintained, searched, protected, and used throughout the platform, along with the complete design of the self-service Churchgoer Portal.

This document works directly with `DEVELOPMENT_PLAN.md` and `advanced_ministry_elder_pastor.md`.

## Table of Contents

- [1. Churchgoer Definition & Scope](#1-churchgoer-definition--scope)
- [2. Data Model & Schema](#2-data-model--schema)
- [3. Adding & Maintaining Churchgoer Information](#3-adding--maintaining-churchgoer-information)
- [4. Search & Directory Features](#4-search--directory-features)
- [5. Churchgoer Usability & Integration Points](#5-churchgoer-usability--integration-points)
- [6. Churchgoer Portal](#6-churchgoer-portal)
- [7. Mobile-First & PWA Strategy](#7-mobile-first--pwa-strategy)
- [8. Security, Privacy & Compliance](#8-security-privacy--compliance)
- [9. Implementation Tasks & Sprint Integration](#9-implementation-tasks--sprint-integration)
- [10. How to Use This Document](#10-how-to-use-this-document)

## 1. Churchgoer Definition & Scope

A churchgoer is any individual who interacts with the church through:

- Regular attendance
- Membership
- Volunteering in ministries
- Participating in events or small groups

Default role: `member_volunteer`.

Churchgoers have strong self-service capabilities and data ownership, while admins and pastors retain oversight for pastoral care, governance, and data protection.

## 2. Data Model & Schema

```sql
-- Families table
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches(id) not null,
  family_name text not null,
  address text,
  home_phone text,
  created_at timestamptz not null default now()
);

-- Core profiles table extensions
alter table public.profiles
  add column if not exists date_of_birth date,
  add column if not exists family_id uuid references public.families(id),
  add column if not exists preferred_contact_method text
    check (preferred_contact_method in ('email', 'sms', 'app', 'none'))
    default 'email',
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists notes text,
  add column if not exists last_attendance timestamptz,
  add column if not exists membership_status text
    check (
      membership_status in ('active', 'inactive', 'visitor', 'baptized', 'transferred')
    )
    default 'active',
  add column if not exists joined_date date default current_date,
  add column if not exists directory_visible boolean default true,
  add column if not exists contact_allowed boolean default true,
  add column if not exists spiritual_gifts jsonb,
  add column if not exists interests text[];

-- Attendance logs
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches(id) not null,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  event_id uuid references public.events(id),
  checked_in_at timestamptz not null default now(),
  status text
    check (status in ('present', 'absent', 'excused', 'online'))
    default 'present'
);

-- Consent and privacy log
create table if not exists public.consent_logs (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches(id) not null,
  profile_id uuid references public.profiles(id) not null,
  consent_type text not null,
  consented boolean not null,
  consented_at timestamptz not null default now()
);
```

**Churchgoer data includes**

- Full name, email, phone, address, avatar
- Family association
- Ministry memberships through `profile_ministries`
- Attendance history
- Contact preferences and consent state
- Directory visibility settings
- Spiritual gifts and interests for ministry matching

Implementation requirements:

- All new churchgoer data must remain tenant-scoped by `church_id`.
- RLS must be added for every new table.
- Sensitive fields such as `notes`, emergency contacts, and consent records require stricter visibility rules than standard public directory data.

## 3. Adding & Maintaining Churchgoer Information

**Admin and pastor methods**

- Single profile creation form with family linking
- CSV bulk import with template download
- Quick "Add Visitor" flow from event check-in
- Merge duplicate tool
- Private pastoral notes field

**Self-service methods**

- Update personal details, avatar, contact preferences, emergency information, and interests
- Toggle directory visibility and contact permissions
- View, but not edit, membership status
- No self-editing of role, pastoral notes, or staff-only governance fields

**Automated processes**

- Last attendance updated on event check-in
- Quarterly profile-completeness nudges
- Birthday and anniversary reminders to leaders when enabled

## 4. Search & Directory Features

**Church directory for logged-in churchgoers**

- Fast search by name, family, or ministry
- Filters for ministry involvement, age group, and membership status
- Card-based mobile view and denser desktop view
- Limited profile preview showing only approved public fields

**Admin directory**

- Advanced full-text search
- Saved searches and filters
- Export to CSV
- Bulk status updates

## 5. Churchgoer Usability & Integration Points

Churchgoer data powers:

- Smart calendar filtering for "My Ministries" and "My Events"
- Volunteer opportunity matching
- Ministry rosters
- Personalized communications
- Kingdom-impact stories
- Spiritual-gifts-based suggestions from advanced ministry features

## 6. Churchgoer Portal

Default route: `/portal`

This route is the intended default landing page for `member_volunteer` users once the dedicated portal surface is implemented.

**Design philosophy**

- Warm
- Simple
- Spiritually inviting
- Mobile-first
- Mantine-based, aligned with the ChurchForge application shell

**Navigation**

- Mobile: bottom tab bar for Home, Calendar, Ministries, Directory, and Profile
- Desktop: sidebar navigation

**Pages**

- `Home`: welcome message, next three events with quick RSVP, announcements, and a prayer prompt
- `Calendar`: categorized church calendar with personal filters
- `My Ministries`: joined ministries, leaders, and open serving opportunities
- `Directory`: searchable church-family directory
- `Profile`: self-edit form plus data-export and deletion-request actions
- `Resources`: church links, sermons, giving, and documents

## 7. Mobile-First & PWA Strategy

- Fully responsive Mantine-first UI
- Installable PWA as a later-phase enhancement
- Offline access to low-risk data such as upcoming events and personal profile details only after explicit security review
- Push notifications for events and reminders in later phases
- Large touch targets and high contrast for all ages

## 8. Security, Privacy & Compliance

- Strict Row Level Security by `church_id`
- Sensitive fields masked or hidden based on role
- Full audit logging for admin access to profiles
- Self-service data export and deletion-request workflow
- Explicit consent tracking
- GDPR and CCPA-aligned processes where applicable

## 9. Implementation Tasks & Sprint Integration

**Sprint 1**

- Extend the `profiles` table
- Add basic self-service profile editing

**Sprint 2**

- Build `/portal` layout and core tabs
- Implement directory search
- Add family grouping and CSV import

**Sprint 3**

- Add attendance system
- Introduce consent management
- Reassess PWA scope against the live security model

**Task checklist**

- Update the Supabase schema with all extensions
- Build self-service profile editing
- Create `/portal` with mobile-friendly navigation
- Implement searchable directory
- Add PWA configuration when approved
- Write RLS policies and consent system

**Acceptance criteria**

- Churchgoers find the portal intuitive and useful
- Admins can efficiently manage rich member data
- All data remains private and properly isolated

## 10. How to Use This Document

1. Reference `churchgoer_data.md` in every issue or PR related to members, profiles, directory, or the portal.
2. Update this document only through Pull Request.
3. Read this document alongside `DEVELOPMENT_PLAN.md` and `advanced_ministry_elder_pastor.md`.
4. Treat this document as the governing spec for churchgoer data and self-service flows.

This document defines how ChurchForge treats every churchgoer with dignity, care, and respect for their data.
