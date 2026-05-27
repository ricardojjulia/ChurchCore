-- ============================================================
-- Member mobile check-in location constraints
-- - Adds optional geofence configuration for event mobile check-in
-- ============================================================

alter table public.event_registration_settings
  add column if not exists mobile_member_check_in_location_lat numeric,
  add column if not exists mobile_member_check_in_location_lng numeric,
  add column if not exists mobile_member_check_in_location_radius_meters integer;

alter table public.event_registration_settings
  drop constraint if exists event_reg_mobile_checkin_lat_range;

alter table public.event_registration_settings
  add constraint event_reg_mobile_checkin_lat_range
  check (
    mobile_member_check_in_location_lat is null
    or (
      mobile_member_check_in_location_lat >= -90
      and mobile_member_check_in_location_lat <= 90
    )
  );

alter table public.event_registration_settings
  drop constraint if exists event_reg_mobile_checkin_lng_range;

alter table public.event_registration_settings
  add constraint event_reg_mobile_checkin_lng_range
  check (
    mobile_member_check_in_location_lng is null
    or (
      mobile_member_check_in_location_lng >= -180
      and mobile_member_check_in_location_lng <= 180
    )
  );

alter table public.event_registration_settings
  drop constraint if exists event_reg_mobile_checkin_radius_positive;

alter table public.event_registration_settings
  add constraint event_reg_mobile_checkin_radius_positive
  check (
    mobile_member_check_in_location_radius_meters is null
    or mobile_member_check_in_location_radius_meters > 0
  );

create index if not exists event_reg_settings_mobile_checkin_location_idx
  on public.event_registration_settings (church_id, event_id)
  where mobile_member_check_in_location_lat is not null
    and mobile_member_check_in_location_lng is not null
    and mobile_member_check_in_location_radius_meters is not null;
