-- G4.1: member numbers are unique per church, not across the whole platform.
--
-- 20260420000000 created a global unique index on profiles (member_number),
-- and 20260430000000 later added the per-church one
-- (profiles_member_number_church_uidx on (church_id, member_number)). With
-- both, two churches could never use the same number, which breaks importing
-- a second church's Planning Center / Breeze export (their ids restart per
-- account and collide). Only the global index is dropped; the per-church
-- index stays, so a number is still unique inside one church.
-- generate_member_number() checks globally, so it remains safe.
--
-- Rollback (fails if two churches now share a number):
--   create unique index if not exists profiles_member_number_uidx
--     on public.profiles (member_number) where member_number is not null;

drop index if exists public.profiles_member_number_uidx;
