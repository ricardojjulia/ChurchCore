-- G1.4 (blockout dates): tighten vbd_own and vbd_manage.
--
-- 1. vbd_own
--
-- The original policy only checked that the row's profile_id was the caller's
-- own profile. It never checked church_id, so a signed-in volunteer could
-- write a row for their own profile tagged with another church's id, which
-- would then show up to that church's admins (vbd_manage). The app always
-- writes the session's church, but the database should enforce it too.
--
-- Reads stay "any of my own rows"; writes must also carry the church that
-- the profile belongs to. EXISTS (not "limit 1") also handles a login linked
-- to more than one profile.

drop policy if exists "vbd_own" on public.volunteer_blocked_dates;

create policy "vbd_own"
  on public.volunteer_blocked_dates for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = volunteer_blocked_dates.profile_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = volunteer_blocked_dates.profile_id
        and p.user_id = auth.uid()
        and p.church_id = volunteer_blocked_dates.church_id
    )
  );

-- Council Review 20: tighten vbd_manage the same way.
--
-- It only checked can_manage_church(church_id), never that the row's profile
-- belongs to that church. The unique key is (profile_id, blocked_date) with no
-- church, so an admin of church A could plant (church A, a church B profile,
-- day) through PostgREST. That row would occupy the slot: church B's own
-- blockout for the day would be silently ignored, and B's planner would keep
-- scheduling the volunteer. Admins now read and write only rows whose profile
-- is in the church they manage.

drop policy if exists "vbd_manage" on public.volunteer_blocked_dates;

create policy "vbd_manage"
  on public.volunteer_blocked_dates for all
  to authenticated
  using (
    public.can_manage_church(church_id)
    and exists (
      select 1 from public.profiles p
      where p.id = volunteer_blocked_dates.profile_id and p.church_id = volunteer_blocked_dates.church_id
    )
  )
  with check (
    public.can_manage_church(church_id)
    and exists (
      select 1 from public.profiles p
      where p.id = volunteer_blocked_dates.profile_id and p.church_id = volunteer_blocked_dates.church_id
    )
  );

-- The planner's pool reads a church's blockouts for one day.
create index if not exists vbd_church_date_idx
  on public.volunteer_blocked_dates (church_id, blocked_date);
