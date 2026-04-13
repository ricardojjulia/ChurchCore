-- ============================================================
-- Pastoral Care Foundation
-- Ref: advanced_ministry_elder_pastor.md
-- Ref: churchgoer_data.md
-- Adds: pastoral_notes and care_assignments with pastor-only RLS
-- ============================================================

create or replace function public.can_access_pastoral_data(target_church uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.church_memberships membership
      where membership.church_id = target_church
        and membership.user_id = auth.uid()
        and membership.is_active
        and membership.role = 'pastor'
    );
$$;

create table if not exists public.pastoral_notes (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists pastoral_notes_church_id_idx
  on public.pastoral_notes (church_id);

create index if not exists pastoral_notes_profile_id_created_at_idx
  on public.pastoral_notes (profile_id, created_at desc);

alter table public.pastoral_notes enable row level security;

drop policy if exists "pastoral_notes_select_pastor_scope" on public.pastoral_notes;

create policy "pastoral_notes_select_pastor_scope"
on public.pastoral_notes
for select
to authenticated
using (
  public.can_access_pastoral_data(church_id)
);

drop policy if exists "pastoral_notes_insert_pastor_scope" on public.pastoral_notes;

create policy "pastoral_notes_insert_pastor_scope"
on public.pastoral_notes
for insert
to authenticated
with check (
  public.can_access_pastoral_data(church_id)
  and exists (
    select 1
    from public.profiles profile
    where profile.id = pastoral_notes.profile_id
      and profile.church_id = pastoral_notes.church_id
  )
  and exists (
    select 1
    from public.profiles profile
    where profile.id = pastoral_notes.created_by
      and profile.user_id = auth.uid()
      and profile.church_id = pastoral_notes.church_id
  )
);

create table if not exists public.care_assignments (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  summary text not null,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'closed')),
  priority text not null default 'routine'
    check (priority in ('routine', 'high', 'urgent')),
  due_at timestamptz,
  last_contact_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists care_assignments_church_id_idx
  on public.care_assignments (church_id);

create index if not exists care_assignments_profile_id_status_idx
  on public.care_assignments (profile_id, status);

drop trigger if exists set_care_assignments_updated_at on public.care_assignments;

create trigger set_care_assignments_updated_at
  before update on public.care_assignments
  for each row execute function public.set_updated_at();

alter table public.care_assignments enable row level security;

drop policy if exists "care_assignments_select_pastor_scope" on public.care_assignments;

create policy "care_assignments_select_pastor_scope"
on public.care_assignments
for select
to authenticated
using (
  public.can_access_pastoral_data(church_id)
);

drop policy if exists "care_assignments_insert_pastor_scope" on public.care_assignments;

create policy "care_assignments_insert_pastor_scope"
on public.care_assignments
for insert
to authenticated
with check (
  public.can_access_pastoral_data(church_id)
  and exists (
    select 1
    from public.profiles profile
    where profile.id = care_assignments.profile_id
      and profile.church_id = care_assignments.church_id
  )
  and exists (
    select 1
    from public.profiles profile
    where profile.id = care_assignments.created_by
      and profile.user_id = auth.uid()
      and profile.church_id = care_assignments.church_id
  )
  and (
    care_assignments.assigned_to is null
    or exists (
      select 1
      from public.profiles profile
      where profile.id = care_assignments.assigned_to
        and profile.church_id = care_assignments.church_id
    )
  )
);

drop policy if exists "care_assignments_update_pastor_scope" on public.care_assignments;

create policy "care_assignments_update_pastor_scope"
on public.care_assignments
for update
to authenticated
using (
  public.can_access_pastoral_data(church_id)
)
with check (
  public.can_access_pastoral_data(church_id)
  and exists (
    select 1
    from public.profiles profile
    where profile.id = care_assignments.profile_id
      and profile.church_id = care_assignments.church_id
  )
  and (
    care_assignments.assigned_to is null
    or exists (
      select 1
      from public.profiles profile
      where profile.id = care_assignments.assigned_to
        and profile.church_id = care_assignments.church_id
    )
  )
);
