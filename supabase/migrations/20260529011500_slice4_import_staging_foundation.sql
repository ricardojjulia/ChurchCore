-- Slice 4 import staging foundation for people/household migration dry runs.

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  import_type text not null,
  source_system text not null,
  source_filename text not null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  status text not null check (status in ('draft', 'dry_run_completed', 'committed', 'failed')),
  dry_run boolean not null default true,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  committed_at timestamptz,
  failed_at timestamptz
);

create index if not exists import_batches_church_created_idx
  on public.import_batches (church_id, created_at desc);

alter table public.import_batches enable row level security;

create policy "import_batches_select_management"
on public.import_batches
for select
to authenticated
using (public.can_manage_church(church_id));

create policy "import_batches_insert_management"
on public.import_batches
for insert
to authenticated
with check (public.can_manage_church(church_id));

create policy "import_batches_update_management"
on public.import_batches
for update
to authenticated
using (public.can_manage_church(church_id))
with check (public.can_manage_church(church_id));

create table if not exists public.import_batch_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete cascade,
  row_number integer not null,
  raw_payload jsonb not null,
  normalized_payload jsonb not null,
  classification text not null check (classification in ('create', 'update', 'skip', 'reject')),
  reason text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists import_batch_rows_batch_idx
  on public.import_batch_rows (batch_id, row_number);

create index if not exists import_batch_rows_church_idx
  on public.import_batch_rows (church_id, classification, created_at desc);

alter table public.import_batch_rows enable row level security;

create policy "import_batch_rows_select_management"
on public.import_batch_rows
for select
to authenticated
using (public.can_manage_church(church_id));

create policy "import_batch_rows_insert_management"
on public.import_batch_rows
for insert
to authenticated
with check (public.can_manage_church(church_id));
