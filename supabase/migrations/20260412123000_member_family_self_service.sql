-- ============================================================
-- Member Family Self-Service
-- Ref: churchgoer_data.md
-- Adds: member-safe family create/update policies and aligns
--       profile self-update policy to user_id semantics
-- ============================================================

drop policy if exists "profiles_update_self" on public.profiles;

create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "families_insert_member_scope" on public.families;

create policy "families_insert_member_scope"
on public.families
for insert
to authenticated
with check (public.belongs_to_church(church_id));

drop policy if exists "families_update_self_scope" on public.families;

create policy "families_update_self_scope"
on public.families
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.user_id = auth.uid()
      and profile.church_id = families.church_id
      and profile.family_id = families.id
  )
)
with check (
  public.belongs_to_church(church_id)
  and exists (
    select 1
    from public.profiles profile
    where profile.user_id = auth.uid()
      and profile.church_id = families.church_id
      and profile.family_id = families.id
  )
);
