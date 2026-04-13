-- ============================================================
-- Churchgoer and Pastor Foundation
-- Ref: churchgoer_data.md
-- Ref: docs/churchgoer-pastor-execution-plan.md
-- Adds: consent_logs, profile interests and spiritual gifts, attendance online support
-- ============================================================

alter table public.profiles
  add column if not exists interests text[],
  add column if not exists spiritual_gifts jsonb;

create table if not exists public.consent_logs (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  consent_type text not null,
  consented boolean not null,
  consented_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists consent_logs_church_id_idx
  on public.consent_logs (church_id);

create index if not exists consent_logs_profile_id_idx
  on public.consent_logs (profile_id);

create index if not exists consent_logs_type_at_idx
  on public.consent_logs (consent_type, consented_at desc);

alter table public.consent_logs enable row level security;

create policy "consent_logs_select_own_or_management_scope"
on public.consent_logs
for select
to authenticated
using (
  profile_id = (
    select id
    from public.profiles
    where user_id = auth.uid()
    limit 1
  )
  or public.can_manage_church(church_id)
);

create policy "consent_logs_insert_own_or_management_scope"
on public.consent_logs
for insert
to authenticated
with check (
  (
    profile_id = (
      select id
      from public.profiles
      where user_id = auth.uid()
      limit 1
    )
    and public.belongs_to_church(church_id)
  )
  or public.can_manage_church(church_id)
);

create policy "consent_logs_update_management_scope"
on public.consent_logs
for update
to authenticated
using (public.can_manage_church(church_id))
with check (public.can_manage_church(church_id));

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'attendance_status_check'
  ) then
    alter table public.attendance
      drop constraint attendance_status_check;
  end if;

  alter table public.attendance
    add constraint attendance_status_check
    check (status in ('present', 'absent', 'excused', 'online'));
end $$;
