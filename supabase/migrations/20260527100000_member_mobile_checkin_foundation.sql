-- ============================================================
-- Member mobile check-in foundation
-- - Adds per-event mobile check-in controls to event registration settings
-- - Expands attendance source metadata options
-- ============================================================

alter table public.event_registration_settings
  add column if not exists mobile_member_check_in_enabled boolean not null default false,
  add column if not exists mobile_member_check_in_starts_at timestamptz,
  add column if not exists mobile_member_check_in_ends_at timestamptz,
  add column if not exists mobile_member_check_in_access_code text,
  add column if not exists mobile_member_check_in_allow_household boolean not null default false;

create index if not exists event_reg_settings_mobile_checkin_idx
  on public.event_registration_settings (church_id, mobile_member_check_in_enabled)
  where mobile_member_check_in_enabled = true;

alter table public.attendance
  drop constraint if exists attendance_check_in_method_check;

alter table public.attendance
  add constraint attendance_check_in_method_check
  check (
    check_in_method in (
      'manual_admin',
      'self_checkin',
      'nfc_qr',
      'mobile_member',
      'kiosk',
      'staff',
      'import'
    )
  );
