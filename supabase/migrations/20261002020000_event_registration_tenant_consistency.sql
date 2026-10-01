-- PR #171 review (S10): an event's registration rows must belong to the
-- event's own church.
--
-- event_registration_settings, _form_fields, event_registrations and
-- event_registration_payments each had separate foreign keys on event_id and
-- church_id, so nothing stopped a row from pairing church A with church B's
-- event. With the public registration page and action now on the
-- church-scoped admin client (RLS bypassed), such a row would show church B's
-- public event on church A's page and let a visitor register across tenants.
-- The code now also filters events.church_id; this makes the pairing
-- impossible to store.

alter table public.events
  add constraint events_id_church_id_key unique (id, church_id);

alter table public.event_registration_settings
  add constraint event_registration_settings_event_church_fkey
  foreign key (event_id, church_id) references public.events (id, church_id) on delete cascade;

alter table public.event_registration_form_fields
  add constraint event_registration_form_fields_event_church_fkey
  foreign key (event_id, church_id) references public.events (id, church_id) on delete cascade;

alter table public.event_registrations
  add constraint event_registrations_event_church_fkey
  foreign key (event_id, church_id) references public.events (id, church_id) on delete cascade;

alter table public.event_registration_payments
  add constraint event_registration_payments_event_church_fkey
  foreign key (event_id, church_id) references public.events (id, church_id) on delete cascade;

-- The composite keys replace the single-column event_id keys: they also
-- require the event to exist and cascade the same way. Keeping both gave
-- PostgREST two relationships to events, so every events embed from these
-- tables failed as ambiguous.
alter table public.event_registration_settings drop constraint event_registration_settings_event_id_fkey;
alter table public.event_registration_form_fields drop constraint event_registration_form_fields_event_id_fkey;
alter table public.event_registrations drop constraint event_registrations_event_id_fkey;
alter table public.event_registration_payments drop constraint event_registration_payments_event_id_fkey;
