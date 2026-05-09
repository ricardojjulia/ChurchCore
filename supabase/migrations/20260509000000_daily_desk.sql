-- Daily Desk: church office work queue for calls, notes, visits, calendar items, and follow-ups.

create table if not exists public.daily_work_items (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  item_type text not null default 'note'
    check (item_type in ('call', 'note', 'visit', 'calendar_item', 'follow_up', 'checkup')),
  title text not null,
  body text,
  status text not null default 'open'
    check (status in ('open', 'scheduled', 'waiting', 'done', 'cancelled')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  direction text
    check (direction is null or direction in ('incoming', 'outgoing')),
  related_profile_id uuid references public.profiles(id) on delete set null,
  assigned_to_profile_id uuid references public.profiles(id) on delete set null,
  scheduled_at timestamptz,
  due_at timestamptz,
  location text,
  created_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists daily_work_items_church_status_idx
  on public.daily_work_items (church_id, status, due_at asc nulls last, scheduled_at asc nulls last);

create index if not exists daily_work_items_related_profile_idx
  on public.daily_work_items (related_profile_id);

create index if not exists daily_work_items_assigned_to_idx
  on public.daily_work_items (assigned_to_profile_id);

drop trigger if exists set_daily_work_items_updated_at on public.daily_work_items;
create trigger set_daily_work_items_updated_at
  before update on public.daily_work_items
  for each row execute function public.set_updated_at();

alter table public.daily_work_items enable row level security;

drop policy if exists "daily_work_items_select_scope" on public.daily_work_items;
create policy "daily_work_items_select_scope"
  on public.daily_work_items for select
  to authenticated
  using (public.can_manage_church(church_id));

drop policy if exists "daily_work_items_insert_scope" on public.daily_work_items;
create policy "daily_work_items_insert_scope"
  on public.daily_work_items for insert
  to authenticated
  with check (public.can_manage_church(church_id));

drop policy if exists "daily_work_items_update_scope" on public.daily_work_items;
create policy "daily_work_items_update_scope"
  on public.daily_work_items for update
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

drop policy if exists "daily_work_items_delete_scope" on public.daily_work_items;
create policy "daily_work_items_delete_scope"
  on public.daily_work_items for delete
  to authenticated
  using (public.can_manage_church(church_id));

do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'audit_log_changes'
      and pronamespace = 'public'::regnamespace
  ) then
    drop trigger if exists audit_daily_work_items_changes on public.daily_work_items;
    create trigger audit_daily_work_items_changes
      after insert or update or delete on public.daily_work_items
      for each row execute function public.audit_log_changes();
  end if;
end $$;
