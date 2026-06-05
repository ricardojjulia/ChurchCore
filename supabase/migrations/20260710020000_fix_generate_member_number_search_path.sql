-- Fix generate_member_number search_path to include extensions schema
-- so that gen_random_bytes() is resolvable when called via Supabase RPC.
-- The function previously used SET search_path TO 'public' which excludes
-- the extensions schema where pgcrypto functions live in Supabase.

CREATE OR REPLACE FUNCTION public.generate_member_number()
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
declare
  candidate text;
begin
  loop
    candidate :=
      'CF-' ||
      to_char(timezone('utc', now()), 'MMDD') ||
      '-' ||
      upper(substring(encode(extensions.gen_random_bytes(4), 'hex') from 1 for 6));

    exit when not exists (
      select 1
      from public.profiles
      where member_number = candidate
    );
  end loop;

  return candidate;
end;
$function$;
