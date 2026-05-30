-- ============================================================
-- ShepherdAI for ChurchCore (Ops-only, product-isolated)
--
-- This migration adds deterministic signal and workflow persistence
-- for ChurchCore ShepherdAI. It is intentionally scoped to Ops
-- and must not aggregate or infer from Academy or Care data.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ai_signals
-- ------------------------------------------------------------

create table if not exists public.ai_signals (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.churches(id) on delete cascade,
  entity_type         text not null,
  entity_id           uuid not null,
  signal_type         text not null,
  signal_value        numeric(10,4) not null,
  signal_window       text not null,
  signal_payload_json jsonb not null default '{}'::jsonb,
  detected_at         timestamptz not null default timezone('utc', now())
);

create index if not exists ai_signals_tenant_entity_idx
  on public.ai_signals (tenant_id, entity_type, entity_id, detected_at desc);

create index if not exists ai_signals_type_detected_idx
  on public.ai_signals (tenant_id, signal_type, detected_at desc);

alter table public.ai_signals enable row level security;

create policy "ai_signals_manage"
  on public.ai_signals for all
  to authenticated
  using (public.can_manage_church(tenant_id))
  with check (public.can_manage_church(tenant_id));

-- ------------------------------------------------------------
-- 2. ai_suggestions
-- ------------------------------------------------------------

create table if not exists public.ai_suggestions (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.churches(id) on delete cascade,
  product_area          text not null default 'ops',
  workflow_type         text not null default 'ministry',
  workflow_code         text not null,
  entity_type           text not null,
  entity_id             uuid not null,
  title                 text not null,
  summary               text not null,
  confidence_score      numeric(5,2) not null,
  urgency               text not null,
  explanation_json      jsonb not null,
  spiritual_support_json jsonb,
  boundary_note         text not null,
  status                text not null default 'suggested',
  generated_at          timestamptz not null default timezone('utc', now()),
  created_at            timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_suggestions_product_area_check'
  ) then
    alter table public.ai_suggestions
      add constraint ai_suggestions_product_area_check
      check (product_area = 'ops');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ai_suggestions_workflow_type_check'
  ) then
    alter table public.ai_suggestions
      add constraint ai_suggestions_workflow_type_check
      check (workflow_type = 'ministry');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ai_suggestions_workflow_code_check'
  ) then
    alter table public.ai_suggestions
      add constraint ai_suggestions_workflow_code_check
      check (workflow_code in (
        'reconnect_inactive_member',
        'volunteer_fatigue',
        'first_time_visitor_follow_up',
        'member_disengagement_trend'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ai_suggestions_urgency_check'
  ) then
    alter table public.ai_suggestions
      add constraint ai_suggestions_urgency_check
      check (urgency in ('low', 'medium', 'high'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ai_suggestions_status_check'
  ) then
    alter table public.ai_suggestions
      add constraint ai_suggestions_status_check
      check (status in ('suggested', 'promoted', 'deferred', 'dismissed', 'completed'));
  end if;
end $$;

create index if not exists ai_suggestions_queue_idx
  on public.ai_suggestions (tenant_id, status, urgency, generated_at desc);

create index if not exists ai_suggestions_entity_idx
  on public.ai_suggestions (tenant_id, entity_type, entity_id, generated_at desc);

create index if not exists ai_suggestions_code_idx
  on public.ai_suggestions (tenant_id, workflow_code, generated_at desc);

alter table public.ai_suggestions enable row level security;

create policy "ai_suggestions_manage"
  on public.ai_suggestions for all
  to authenticated
  using (public.can_manage_church(tenant_id))
  with check (public.can_manage_church(tenant_id));

-- ------------------------------------------------------------
-- 3. workflows
-- ------------------------------------------------------------

create table if not exists public.workflows (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.churches(id) on delete cascade,
  suggestion_id       uuid references public.ai_suggestions(id) on delete set null,
  workflow_type       text not null default 'ministry',
  owner_user_id       uuid references public.profiles(id) on delete set null,
  assigned_to_user_id uuid references public.profiles(id) on delete set null,
  status              text not null default 'open',
  due_at              timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workflows_workflow_type_check'
  ) then
    alter table public.workflows
      add constraint workflows_workflow_type_check
      check (workflow_type = 'ministry');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'workflows_status_check'
  ) then
    alter table public.workflows
      add constraint workflows_status_check
      check (status in ('open', 'assigned', 'deferred', 'dismissed', 'completed'));
  end if;
end $$;

create index if not exists workflows_queue_idx
  on public.workflows (tenant_id, status, created_at desc);

create index if not exists workflows_assignee_idx
  on public.workflows (tenant_id, assigned_to_user_id, status);

alter table public.workflows enable row level security;

create policy "workflows_manage"
  on public.workflows for all
  to authenticated
  using (public.can_manage_church(tenant_id))
  with check (public.can_manage_church(tenant_id));

-- ------------------------------------------------------------
-- 4. workflow_actions
-- ------------------------------------------------------------

create table if not exists public.workflow_actions (
  id                  uuid primary key default gen_random_uuid(),
  workflow_id         uuid not null references public.workflows(id) on delete cascade,
  action_type         text not null,
  action_payload_json jsonb not null default '{}'::jsonb,
  status              text not null default 'pending',
  created_at          timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workflow_actions_status_check'
  ) then
    alter table public.workflow_actions
      add constraint workflow_actions_status_check
      check (status in ('pending', 'completed', 'dismissed', 'cancelled'));
  end if;
end $$;

create index if not exists workflow_actions_workflow_idx
  on public.workflow_actions (workflow_id, created_at desc);

alter table public.workflow_actions enable row level security;

create policy "workflow_actions_manage"
  on public.workflow_actions for all
  to authenticated
  using (
    exists (
      select 1
      from public.workflows workflow
      where workflow.id = workflow_actions.workflow_id
        and public.can_manage_church(workflow.tenant_id)
    )
  )
  with check (
    exists (
      select 1
      from public.workflows workflow
      where workflow.id = workflow_actions.workflow_id
        and public.can_manage_church(workflow.tenant_id)
    )
  );

-- ------------------------------------------------------------
-- 5. workflow_feedback
-- ------------------------------------------------------------

create table if not exists public.workflow_feedback (
  id            uuid primary key default gen_random_uuid(),
  workflow_id   uuid not null references public.workflows(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  feedback_type text not null,
  notes         text,
  created_at    timestamptz not null default timezone('utc', now())
);

create index if not exists workflow_feedback_workflow_idx
  on public.workflow_feedback (workflow_id, created_at desc);

alter table public.workflow_feedback enable row level security;

create policy "workflow_feedback_manage"
  on public.workflow_feedback for all
  to authenticated
  using (
    exists (
      select 1
      from public.workflows workflow
      where workflow.id = workflow_feedback.workflow_id
        and public.can_manage_church(workflow.tenant_id)
    )
  )
  with check (
    exists (
      select 1
      from public.workflows workflow
      where workflow.id = workflow_feedback.workflow_id
        and public.can_manage_church(workflow.tenant_id)
    )
  );
