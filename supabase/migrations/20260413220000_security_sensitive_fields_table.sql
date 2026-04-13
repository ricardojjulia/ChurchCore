-- ============================================================
-- Security: profile_sensitive_fields — isolate PHI/PII
-- Ref: docs/security-assessment.md (H-2, H-3, C-3)
-- Ref: docs/security-mitigation-plan.md (P1-C)
--
-- Moves date_of_birth, emergency_contact_name, and
-- emergency_contact_phone off the main profiles table into a
-- separate table with strict RLS:
--   - Self: read + write own row
--   - Church admin / pastor: full access within church
--   - All others: no access
--
-- App code joins this table server-side where needed.
-- The authenticated role cannot accidentally SELECT these
-- columns via a broad profiles query.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Create the table
-- ------------------------------------------------------------

create table if not exists public.profile_sensitive_fields (
  profile_id            uuid        primary key references public.profiles (id) on delete cascade,
  church_id             uuid        not null references public.churches (id) on delete cascade,
  date_of_birth         date,
  emergency_contact_name  text,
  emergency_contact_phone text,
  created_at            timestamptz not null default timezone('utc', now()),
  updated_at            timestamptz not null default timezone('utc', now())
);

create index if not exists profile_sensitive_fields_church_id_idx
  on public.profile_sensitive_fields (church_id);

create trigger set_profile_sensitive_fields_updated_at
  before update on public.profile_sensitive_fields
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 2. Migrate existing data from profiles
-- ------------------------------------------------------------

insert into public.profile_sensitive_fields (
  profile_id,
  church_id,
  date_of_birth,
  emergency_contact_name,
  emergency_contact_phone
)
select
  p.id,
  p.church_id,
  p.date_of_birth,
  p.emergency_contact_name,
  p.emergency_contact_phone
from public.profiles p
where p.church_id is not null
  and (
    p.date_of_birth is not null
    or p.emergency_contact_name is not null
    or p.emergency_contact_phone is not null
  )
on conflict (profile_id) do nothing;

-- ------------------------------------------------------------
-- 3. Drop the columns from profiles
-- ------------------------------------------------------------

alter table public.profiles
  drop column if exists date_of_birth,
  drop column if exists emergency_contact_name,
  drop column if exists emergency_contact_phone;

-- ------------------------------------------------------------
-- 4. Enable RLS
-- ------------------------------------------------------------

alter table public.profile_sensitive_fields enable row level security;

-- Own profile: member can read their own sensitive fields
create policy "sensitive_fields_select_self"
on public.profile_sensitive_fields
for select
to authenticated
using (
  profile_id = (
    select p.id
    from public.profiles p
    where p.user_id = auth.uid()
      and p.church_id = profile_sensitive_fields.church_id
    limit 1
  )
);

-- Church admin / pastor: can read all within their church
create policy "sensitive_fields_select_management"
on public.profile_sensitive_fields
for select
to authenticated
using (
  public.can_manage_church(church_id)
);

-- Own profile: member can insert their own row (first time)
create policy "sensitive_fields_insert_self"
on public.profile_sensitive_fields
for insert
to authenticated
with check (
  public.belongs_to_church(church_id)
  and profile_id = (
    select p.id
    from public.profiles p
    where p.user_id = auth.uid()
      and p.church_id = profile_sensitive_fields.church_id
    limit 1
  )
);

-- Own profile: member can update their own row
create policy "sensitive_fields_update_self"
on public.profile_sensitive_fields
for update
to authenticated
using (
  profile_id = (
    select p.id
    from public.profiles p
    where p.user_id = auth.uid()
      and p.church_id = profile_sensitive_fields.church_id
    limit 1
  )
)
with check (
  profile_id = (
    select p.id
    from public.profiles p
    where p.user_id = auth.uid()
      and p.church_id = profile_sensitive_fields.church_id
    limit 1
  )
);

-- Church admin / pastor: full access within church
create policy "sensitive_fields_manage_management"
on public.profile_sensitive_fields
for all
to authenticated
using (public.can_manage_church(church_id))
with check (public.can_manage_church(church_id));
