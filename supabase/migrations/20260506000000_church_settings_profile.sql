-- Sprint 2: church setup profile fields for tenant church-admin settings.

alter table public.churches
  add column if not exists legal_name text,
  add column if not exists website_url text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists mailing_address text,
  add column if not exists public_summary text;

comment on column public.churches.legal_name is
  'Optional legal or incorporated name for church setup and records.';

comment on column public.churches.website_url is
  'Public church website URL for setup, public portal, and communications surfaces.';

comment on column public.churches.contact_email is
  'Primary administrative contact email for the tenant church.';

comment on column public.churches.contact_phone is
  'Primary administrative contact phone for the tenant church.';

comment on column public.churches.mailing_address is
  'Primary mailing address for tenant church administration.';

comment on column public.churches.public_summary is
  'Short public-facing church description for portal and future setup surfaces.';
