-- Security C-3: member_directory view — column-restricted read surface
-- Replaces the existing member_directory view.
-- Row filtering is handled by the existing profiles_select_member_scope RLS policy
-- (security_invoker = true means the caller's session applies to the underlying profiles read).
-- Members see ONLY directory-safe columns; restricted columns are absent.

drop view if exists public.member_directory;

create or replace view public.member_directory
with (security_invoker = true)
as
select
  p.id,
  p.church_id,
  p.user_id,
  p.full_name,
  p.display_title,
  p.role,
  p.avatar_url,
  p.directory_visible,
  p.contact_allowed,
  case when p.contact_allowed then p.email  else null end as email,
  case when p.contact_allowed then p.phone  else null end as phone
from public.profiles p
where p.directory_visible = true
  and p.merged_at is null;

grant select on public.member_directory to authenticated;

comment on view public.member_directory is
  'Member-safe directory view. Column-restricted: omits address, notes, is_pastoral, '
  'member_number, interests, spiritual_gifts, merged_into_profile_id, merged_at, '
  'account_status, is_roster_eligible, preferred_contact_method, last_attendance, '
  'membership_status, joined_date, data_export_requested_at, data_delete_* columns. '
  'Row filtering via profiles_select_member_scope RLS (security_invoker=true).';
