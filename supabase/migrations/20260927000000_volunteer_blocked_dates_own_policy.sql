-- G1.4 (blockout dates): tighten vbd_own.
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
