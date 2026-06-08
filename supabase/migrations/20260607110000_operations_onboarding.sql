-- ============================================================
-- Operations Module: Onboarding Templates and Instances
-- Ref: CC-OPS-001
-- Adds: onboarding_templates, onboarding_template_steps,
--       onboarding_instances, onboarding_instance_steps
-- Requires: can_access_operations from 20260607100000
-- ============================================================

-- ── Onboarding templates ──────────────────────────────────────

create table if not exists public.onboarding_templates (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  name        text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  deleted_at  timestamptz,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now())
);

create index if not exists onboarding_templates_church_active_idx
  on public.onboarding_templates (church_id)
  where deleted_at is null;

-- ── Onboarding template steps ─────────────────────────────────

create table if not exists public.onboarding_template_steps (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references public.churches(id) on delete cascade,
  template_id   uuid not null references public.onboarding_templates(id) on delete cascade,
  sort_order    int not null default 0,
  title         text not null,
  description   text,
  assignee_type text not null check (assignee_type in ('staff','new_member')),
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now())
);

create index if not exists onboarding_template_steps_template_sort_idx
  on public.onboarding_template_steps (template_id, sort_order);

-- ── Onboarding instances ──────────────────────────────────────

create table if not exists public.onboarding_instances (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.churches(id) on delete cascade,
  template_id  uuid references public.onboarding_templates(id) on delete set null,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  started_by   uuid references public.profiles(id) on delete set null,
  status       text not null default 'open' check (status in ('open','closed')),
  close_reason text,
  closed_at    timestamptz,
  created_at   timestamptz not null default timezone('utc', now()),
  updated_at   timestamptz not null default timezone('utc', now())
);

create index if not exists onboarding_instances_church_profile_idx
  on public.onboarding_instances (church_id, profile_id);

-- ── Onboarding instance steps ─────────────────────────────────

create table if not exists public.onboarding_instance_steps (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references public.churches(id) on delete cascade,
  instance_id   uuid not null references public.onboarding_instances(id) on delete cascade,
  sort_order    int not null default 0,
  title         text not null,
  description   text,
  assignee_type text not null check (assignee_type in ('staff','new_member')),
  is_complete   boolean not null default false,
  completed_at  timestamptz,
  completed_by  uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now())
);

create index if not exists onboarding_instance_steps_instance_sort_idx
  on public.onboarding_instance_steps (instance_id, sort_order);

-- ── updated_at triggers ───────────────────────────────────────

do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'set_updated_at'
      and pronamespace = 'public'::regnamespace
  ) then
    drop trigger if exists set_onboarding_templates_updated_at on public.onboarding_templates;
    create trigger set_onboarding_templates_updated_at
      before update on public.onboarding_templates
      for each row execute function public.set_updated_at();

    drop trigger if exists set_onboarding_template_steps_updated_at on public.onboarding_template_steps;
    create trigger set_onboarding_template_steps_updated_at
      before update on public.onboarding_template_steps
      for each row execute function public.set_updated_at();

    drop trigger if exists set_onboarding_instances_updated_at on public.onboarding_instances;
    create trigger set_onboarding_instances_updated_at
      before update on public.onboarding_instances
      for each row execute function public.set_updated_at();

    drop trigger if exists set_onboarding_instance_steps_updated_at on public.onboarding_instance_steps;
    create trigger set_onboarding_instance_steps_updated_at
      before update on public.onboarding_instance_steps
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- ── RLS ───────────────────────────────────────────────────────

alter table public.onboarding_templates enable row level security;
alter table public.onboarding_template_steps enable row level security;
alter table public.onboarding_instances enable row level security;
alter table public.onboarding_instance_steps enable row level security;

-- onboarding_templates
drop policy if exists "onboarding_templates_select_scope" on public.onboarding_templates;
create policy "onboarding_templates_select_scope"
  on public.onboarding_templates for select to authenticated
  using (public.can_access_operations(church_id));

drop policy if exists "onboarding_templates_insert_scope" on public.onboarding_templates;
create policy "onboarding_templates_insert_scope"
  on public.onboarding_templates for insert to authenticated
  with check (public.can_access_operations(church_id));

drop policy if exists "onboarding_templates_update_scope" on public.onboarding_templates;
create policy "onboarding_templates_update_scope"
  on public.onboarding_templates for update to authenticated
  using (public.can_access_operations(church_id))
  with check (public.can_access_operations(church_id));

drop policy if exists "onboarding_templates_delete_scope" on public.onboarding_templates;
create policy "onboarding_templates_delete_scope"
  on public.onboarding_templates for delete to authenticated
  using (public.can_access_operations(church_id));

-- onboarding_template_steps
drop policy if exists "onboarding_template_steps_select_scope" on public.onboarding_template_steps;
create policy "onboarding_template_steps_select_scope"
  on public.onboarding_template_steps for select to authenticated
  using (public.can_access_operations(church_id));

drop policy if exists "onboarding_template_steps_insert_scope" on public.onboarding_template_steps;
create policy "onboarding_template_steps_insert_scope"
  on public.onboarding_template_steps for insert to authenticated
  with check (public.can_access_operations(church_id));

drop policy if exists "onboarding_template_steps_update_scope" on public.onboarding_template_steps;
create policy "onboarding_template_steps_update_scope"
  on public.onboarding_template_steps for update to authenticated
  using (public.can_access_operations(church_id))
  with check (public.can_access_operations(church_id));

drop policy if exists "onboarding_template_steps_delete_scope" on public.onboarding_template_steps;
create policy "onboarding_template_steps_delete_scope"
  on public.onboarding_template_steps for delete to authenticated
  using (public.can_access_operations(church_id));

-- onboarding_instances
drop policy if exists "onboarding_instances_select_scope" on public.onboarding_instances;
create policy "onboarding_instances_select_scope"
  on public.onboarding_instances for select to authenticated
  using (public.can_access_operations(church_id));

drop policy if exists "onboarding_instances_insert_scope" on public.onboarding_instances;
create policy "onboarding_instances_insert_scope"
  on public.onboarding_instances for insert to authenticated
  with check (public.can_access_operations(church_id));

drop policy if exists "onboarding_instances_update_scope" on public.onboarding_instances;
create policy "onboarding_instances_update_scope"
  on public.onboarding_instances for update to authenticated
  using (public.can_access_operations(church_id))
  with check (public.can_access_operations(church_id));

drop policy if exists "onboarding_instances_delete_scope" on public.onboarding_instances;
create policy "onboarding_instances_delete_scope"
  on public.onboarding_instances for delete to authenticated
  using (public.can_access_operations(church_id));

-- onboarding_instance_steps
drop policy if exists "onboarding_instance_steps_select_scope" on public.onboarding_instance_steps;
create policy "onboarding_instance_steps_select_scope"
  on public.onboarding_instance_steps for select to authenticated
  using (public.can_access_operations(church_id));

drop policy if exists "onboarding_instance_steps_insert_scope" on public.onboarding_instance_steps;
create policy "onboarding_instance_steps_insert_scope"
  on public.onboarding_instance_steps for insert to authenticated
  with check (public.can_access_operations(church_id));

drop policy if exists "onboarding_instance_steps_update_scope" on public.onboarding_instance_steps;
create policy "onboarding_instance_steps_update_scope"
  on public.onboarding_instance_steps for update to authenticated
  using (public.can_access_operations(church_id))
  with check (public.can_access_operations(church_id));

drop policy if exists "onboarding_instance_steps_delete_scope" on public.onboarding_instance_steps;
create policy "onboarding_instance_steps_delete_scope"
  on public.onboarding_instance_steps for delete to authenticated
  using (public.can_access_operations(church_id));

-- ── Audit trigger registrations (conditional) ─────────────────

do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'audit_log_changes'
      and pronamespace = 'public'::regnamespace
  ) then
    drop trigger if exists audit_onboarding_templates_changes on public.onboarding_templates;
    create trigger audit_onboarding_templates_changes
      after insert or update or delete on public.onboarding_templates
      for each row execute function public.audit_log_changes();

    drop trigger if exists audit_onboarding_template_steps_changes on public.onboarding_template_steps;
    create trigger audit_onboarding_template_steps_changes
      after insert or update or delete on public.onboarding_template_steps
      for each row execute function public.audit_log_changes();

    drop trigger if exists audit_onboarding_instances_changes on public.onboarding_instances;
    create trigger audit_onboarding_instances_changes
      after insert or update or delete on public.onboarding_instances
      for each row execute function public.audit_log_changes();

    drop trigger if exists audit_onboarding_instance_steps_changes on public.onboarding_instance_steps;
    create trigger audit_onboarding_instance_steps_changes
      after insert or update or delete on public.onboarding_instance_steps
      for each row execute function public.audit_log_changes();
  end if;
end $$;
