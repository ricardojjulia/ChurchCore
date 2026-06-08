-- ============================================================
-- CC-COMM-001 — Communication Templates & Send Lifecycle
-- Adds: communication_templates table,
--       segment_criteria / scheduled_for columns on communication_logs,
--       can_manage_communications RLS helper.
-- ============================================================

-- ── 1. communication_templates ───────────────────────────────
create table if not exists public.communication_templates (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  name        text not null,
  channel     text not null check (channel in ('email', 'sms')),
  subject     text,
  body        text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now())
);

create index if not exists communication_templates_church_created_idx
  on public.communication_templates (church_id, created_at desc);

-- updated_at trigger — guard with IF NOT EXISTS pattern
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_communication_templates_updated_at'
      and tgrelid = 'public.communication_templates'::regclass
  ) then
    create trigger set_communication_templates_updated_at
      before update on public.communication_templates
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- ── 2. RLS helper — can_manage_communications ─────────────────
create or replace function public.can_manage_communications(target_church uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
  or exists (
    select 1 from public.church_memberships m
    where m.church_id = target_church
      and m.user_id = auth.uid()
      and m.is_active
      and m.role::text in ('church_admin', 'secretary', 'pastor')
  );
$$;

-- ── 3. RLS on communication_templates ────────────────────────
alter table public.communication_templates enable row level security;

drop policy if exists "communication_templates_select_scope" on public.communication_templates;
create policy "communication_templates_select_scope"
  on public.communication_templates for select
  to authenticated
  using (public.can_manage_communications(church_id));

drop policy if exists "communication_templates_insert_scope" on public.communication_templates;
create policy "communication_templates_insert_scope"
  on public.communication_templates for insert
  to authenticated
  with check (public.can_manage_communications(church_id));

drop policy if exists "communication_templates_update_scope" on public.communication_templates;
create policy "communication_templates_update_scope"
  on public.communication_templates for update
  to authenticated
  using (public.can_manage_communications(church_id))
  with check (public.can_manage_communications(church_id));

drop policy if exists "communication_templates_delete_scope" on public.communication_templates;
create policy "communication_templates_delete_scope"
  on public.communication_templates for delete
  to authenticated
  using (public.can_manage_communications(church_id));

-- ── 4. Extend communication_logs with new columns ────────────
-- segment_criteria: the SegmentFilter jsonb used to compose this message.
-- scheduled_for: already added in communications_phase6; use add if not exists.

alter table public.communication_logs
  add column if not exists segment_criteria jsonb;

alter table public.communication_logs
  add column if not exists scheduled_for timestamptz;

-- ── 5. Audit trigger — communication_templates ───────────────
do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'audit_log_changes'
      and pronamespace = 'public'::regnamespace
  ) then
    if not exists (
      select 1 from pg_trigger
      where tgname = 'audit_communication_templates_changes'
        and tgrelid = 'public.communication_templates'::regclass
    ) then
      create trigger audit_communication_templates_changes
        after insert or update or delete on public.communication_templates
        for each row execute function public.audit_log_changes();
    end if;
  end if;
end $$;
