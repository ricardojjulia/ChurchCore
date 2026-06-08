-- ============================================================
-- Operations Module: Church Documents
-- Ref: CC-OPS-001
-- Adds: can_access_operations helper, church_documents table
-- ============================================================

-- Helper function: can_access_operations
-- Allows platform admins and church_admin/pastor role members.
create or replace function public.can_access_operations(target_church uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
  or exists (
    select 1 from public.church_memberships m
    where m.church_id = target_church
      and m.user_id = auth.uid()
      and m.is_active
      and m.role in ('church_admin', 'pastor')
  );
$$;

-- Church documents: vision/mission, faith stances, policies, general, and
-- elder council notes (encrypted at the app layer via lib/crypto/pastoral.ts).
create table if not exists public.church_documents (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  title       text not null,
  doc_type    text not null check (doc_type in ('vision_mission','faith_stance','policy','general','elder_council_notes')),
  body        text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now())
);

comment on column public.church_documents.body is
  'Plaintext for all doc_types except elder_council_notes. For elder_council_notes: AES-256-GCM ciphertext via lib/crypto/pastoral.ts.';

create index if not exists church_documents_church_type_idx
  on public.church_documents (church_id, doc_type);

create index if not exists church_documents_church_created_at_idx
  on public.church_documents (church_id, created_at desc);

-- updated_at trigger — use set_updated_at() if it exists (same guard as 20260509000000_daily_desk.sql)
do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'set_updated_at'
      and pronamespace = 'public'::regnamespace
  ) then
    drop trigger if exists set_church_documents_updated_at on public.church_documents;
    create trigger set_church_documents_updated_at
      before update on public.church_documents
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.church_documents enable row level security;

drop policy if exists "church_documents_select_scope" on public.church_documents;
create policy "church_documents_select_scope"
  on public.church_documents for select
  to authenticated
  using (public.can_access_operations(church_id));

drop policy if exists "church_documents_insert_scope" on public.church_documents;
create policy "church_documents_insert_scope"
  on public.church_documents for insert
  to authenticated
  with check (public.can_access_operations(church_id));

drop policy if exists "church_documents_update_scope" on public.church_documents;
create policy "church_documents_update_scope"
  on public.church_documents for update
  to authenticated
  using (public.can_access_operations(church_id))
  with check (public.can_access_operations(church_id));

drop policy if exists "church_documents_delete_scope" on public.church_documents;
create policy "church_documents_delete_scope"
  on public.church_documents for delete
  to authenticated
  using (public.can_access_operations(church_id));

-- Audit trigger registration (conditional)
do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'audit_log_changes'
      and pronamespace = 'public'::regnamespace
  ) then
    drop trigger if exists audit_church_documents_changes on public.church_documents;
    create trigger audit_church_documents_changes
      after insert or update or delete on public.church_documents
      for each row execute function public.audit_log_changes();
  end if;
end $$;
