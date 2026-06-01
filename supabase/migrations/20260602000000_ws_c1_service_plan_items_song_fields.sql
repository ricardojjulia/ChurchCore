-- WS-C1: add song-specific metadata columns to service_plan_items
-- All three columns are nullable with no default — no back-fill required.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'service_plan_items'
      and column_name  = 'song_key'
  ) then
    alter table public.service_plan_items add column song_key text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'service_plan_items'
      and column_name  = 'duration_seconds'
  ) then
    alter table public.service_plan_items add column duration_seconds int;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'service_plan_items'
      and column_name  = 'artist'
  ) then
    alter table public.service_plan_items add column artist text;
  end if;
end $$;

-- Reassign sort_order sequentially by created_at per plan for existing items
-- that have colliding sort_order = 0 values.
with ordered as (
  select id,
         row_number() over (partition by plan_id order by created_at, id) - 1 as new_sort_order
  from public.service_plan_items
)
update public.service_plan_items spi
set sort_order = ordered.new_sort_order
from ordered
where spi.id = ordered.id;
