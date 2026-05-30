-- ============================================================
-- Volunteer shift reminders audit log (Wave A2)
-- ============================================================

create table if not exists public.volunteer_shift_reminders (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  shift_id uuid not null references public.volunteer_shifts (id) on delete cascade,
  reminded_profile_id uuid references public.profiles (id) on delete set null,
  reminder_channel text not null default 'manual',
  reminder_note text,
  sent_by uuid references public.profiles (id) on delete set null,
  sent_at timestamptz not null default timezone('utc', now())
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'volunteer_shift_reminders_channel_check') then
    alter table public.volunteer_shift_reminders
      add constraint volunteer_shift_reminders_channel_check
      check (reminder_channel in ('manual', 'email', 'sms', 'push'));
  end if;
end $$;

create index if not exists volunteer_shift_reminders_church_id_idx
  on public.volunteer_shift_reminders (church_id);

create index if not exists volunteer_shift_reminders_shift_id_idx
  on public.volunteer_shift_reminders (shift_id);

create index if not exists volunteer_shift_reminders_sent_at_idx
  on public.volunteer_shift_reminders (sent_at desc);

alter table public.volunteer_shift_reminders enable row level security;

create policy "volunteer_shift_reminders_manage"
  on public.volunteer_shift_reminders for all
  to authenticated
  using (public.can_manage_church(church_id))
  with check (public.can_manage_church(church_id));

create policy "volunteer_shift_reminders_select_member"
  on public.volunteer_shift_reminders for select
  to authenticated
  using (public.belongs_to_church(church_id));
