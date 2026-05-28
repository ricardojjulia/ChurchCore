import "server-only";

import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import { hasTenantDbUrl } from "@/lib/supabase/config";

export type PublicEventRegistrationField = {
  id: string;
  eventId: string;
  label: string;
  fieldKey: string;
  fieldType: "text" | "textarea" | "select" | "checkbox" | "number";
  isRequired: boolean;
  options: string[];
  sortOrder: number;
};

export type PublicEventRegistrationOption = {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  category: string;
  priceCents: number;
  currency: string;
  capacity: number | null;
  registrationCount: number;
  waitlistCount: number;
  approvalRequired: boolean;
  householdRegistrationEnabled: boolean;
  deadline: string | null;
  fields: PublicEventRegistrationField[];
};

async function hasPublicTable(table: string): Promise<boolean> {
  const result = await queryTenantLocalDb<{ exists: boolean }>(
    `select exists (
       select 1
       from information_schema.tables
       where table_schema = 'public'
         and table_name = $1
     ) as exists`,
    [table],
  );

  return Boolean(result.rows[0]?.exists);
}

async function hasPublicColumn(table: string, column: string): Promise<boolean> {
  const result = await queryTenantLocalDb<{ exists: boolean }>(
    `select exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = $1
         and column_name = $2
     ) as exists`,
    [table, column],
  );

  return Boolean(result.rows[0]?.exists);
}

export async function getPublicEventRegistrationOptions(
  churchId: string,
): Promise<PublicEventRegistrationOption[]> {
  if (!churchId.trim()) {
    return [];
  }

  if (!hasTenantBackendEnv() && !hasTenantDbUrl()) {
    return [];
  }

  if (shouldUseLocalTenantFallback() || !hasTenantBackendEnv()) {
    const hasFormFieldsTable = await hasPublicTable("event_registration_form_fields");
    const hasApprovalColumn = await hasPublicColumn("event_registration_settings", "approval_required");
    const hasHouseholdColumn = await hasPublicColumn(
      "event_registration_settings",
      "household_registration_enabled",
    );

    const settingsResult = await queryTenantLocalDb<{
      event_id: string;
      title: string;
      starts_at: string;
      ends_at: string;
      category: string;
      price_cents: number;
      currency: string;
      capacity: number | null;
      deadline: string | null;
      waitlist_enabled: boolean;
      approval_required: boolean;
      household_registration_enabled: boolean;
      registration_count: number;
      waitlist_count: number;
    }>(
      `select
         event.id as event_id,
         event.title,
         event.starts_at,
         event.ends_at,
         event.category,
         settings.price_cents,
         settings.currency,
         settings.capacity,
         settings.deadline,
         settings.waitlist_enabled,
         ${hasApprovalColumn ? "coalesce(settings.approval_required, false)" : "false"} as approval_required,
         ${hasHouseholdColumn ? "coalesce(settings.household_registration_enabled, false)" : "false"} as household_registration_enabled,
         coalesce(
           count(reg.id) filter (where reg.is_waitlisted = false and reg.status != 'cancelled'),
           0
         )::int as registration_count,
         coalesce(
           count(reg.id) filter (where reg.is_waitlisted = true and reg.status != 'cancelled'),
           0
         )::int as waitlist_count
       from public.event_registration_settings settings
       join public.events event
         on event.id = settings.event_id
       left join public.event_registrations reg
         on reg.event_id = event.id
         and reg.church_id = event.church_id
       where settings.church_id = $1
         and settings.registration_open = true
         and event.visibility = 'public'
         and event.starts_at >= timezone('utc', now()) - interval '1 day'
         and event.starts_at <= timezone('utc', now()) + interval '60 days'
       group by
         event.id,
         event.title,
         event.starts_at,
         event.ends_at,
         event.category,
         settings.price_cents,
         settings.currency,
         settings.capacity,
         settings.deadline,
         settings.waitlist_enabled${hasApprovalColumn ? ", settings.approval_required" : ""}${hasHouseholdColumn ? ", settings.household_registration_enabled" : ""}
       order by event.starts_at asc
       limit 30`,
      [churchId],
    );

    const fieldRows = hasFormFieldsTable
      ? (
          await queryTenantLocalDb<{
            id: string;
            event_id: string;
            label: string;
            field_key: string;
            field_type: string;
            is_required: boolean;
            options: string[] | null;
            sort_order: number;
          }>(
            `select id, event_id, label, field_key, field_type, is_required, options, sort_order
             from public.event_registration_form_fields
             where church_id = $1
             order by event_id, sort_order`,
            [churchId],
          )
        ).rows
      : [];

    const fieldsByEvent = fieldRows.reduce(
      (map, row) => {
        const field: PublicEventRegistrationField = {
          id: row.id,
          eventId: row.event_id,
          label: row.label,
          fieldKey: row.field_key,
          fieldType: (row.field_type as PublicEventRegistrationField["fieldType"]) ?? "text",
          isRequired: row.is_required,
          options: row.options ?? [],
          sortOrder: row.sort_order,
        };
        const existing = map.get(row.event_id) ?? [];
        existing.push(field);
        map.set(row.event_id, existing);
        return map;
      },
      new Map<string, PublicEventRegistrationField[]>(),
    );

    return settingsResult.rows.map((row) => ({
      eventId: row.event_id,
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      category: row.category,
      priceCents: row.price_cents,
      currency: row.currency,
      capacity: row.capacity,
      registrationCount: row.registration_count,
      waitlistCount: row.waitlist_count,
      approvalRequired: row.approval_required,
      householdRegistrationEnabled: row.household_registration_enabled,
      deadline: row.deadline,
      fields: fieldsByEvent.get(row.event_id) ?? [],
    }));
  }

  const supabase = await createTenantServerClient();

  const settingsQuery = await supabase
    .from("event_registration_settings")
    .select(
      "event_id, price_cents, currency, capacity, deadline, waitlist_enabled, approval_required, household_registration_enabled, events!inner(id, title, starts_at, ends_at, category, visibility)",
    )
    .eq("church_id", churchId)
    .eq("registration_open", true)
    .eq("events.visibility", "public");

  const registrationCountsQuery = await supabase
    .from("event_registrations")
    .select("event_id, is_waitlisted")
    .eq("church_id", churchId)
    .neq("status", "cancelled");

  const fieldsQuery = await supabase
    .from("event_registration_form_fields")
    .select("id, event_id, label, field_key, field_type, is_required, options, sort_order")
    .eq("church_id", churchId)
    .order("sort_order");

  const settingsRows = (settingsQuery.data ?? []) as Array<{
    event_id: string;
    price_cents: number;
    currency: string;
    capacity: number | null;
    deadline: string | null;
    waitlist_enabled: boolean;
    approval_required: boolean | null;
    household_registration_enabled: boolean | null;
    events: Array<{
      id: string;
      title: string;
      starts_at: string;
      ends_at: string;
      category: string;
      visibility: string;
    }>;
  }>;

  const countRows = (registrationCountsQuery.data ?? []) as Array<{
    event_id: string;
    is_waitlisted: boolean;
  }>;

  const fieldRows = (fieldsQuery.data ?? []) as Array<{
    id: string;
    event_id: string;
    label: string;
    field_key: string;
    field_type: string;
    is_required: boolean;
    options: string[] | null;
    sort_order: number;
  }>;

  const countsByEvent = countRows.reduce(
    (map, row) => {
      const existing = map.get(row.event_id) ?? { registrationCount: 0, waitlistCount: 0 };
      if (row.is_waitlisted) {
        existing.waitlistCount += 1;
      } else {
        existing.registrationCount += 1;
      }
      map.set(row.event_id, existing);
      return map;
    },
    new Map<string, { registrationCount: number; waitlistCount: number }>(),
  );

  const fieldsByEvent = fieldRows.reduce(
    (map, row) => {
      const field: PublicEventRegistrationField = {
        id: row.id,
        eventId: row.event_id,
        label: row.label,
        fieldKey: row.field_key,
        fieldType: (row.field_type as PublicEventRegistrationField["fieldType"]) ?? "text",
        isRequired: row.is_required,
        options: row.options ?? [],
        sortOrder: row.sort_order,
      };
      const existing = map.get(row.event_id) ?? [];
      existing.push(field);
      map.set(row.event_id, existing);
      return map;
    },
    new Map<string, PublicEventRegistrationField[]>(),
  );

  return settingsRows
    .map((row) => {
      const event = row.events[0];
      if (!event) {
        return null;
      }

      const counts = countsByEvent.get(row.event_id) ?? {
        registrationCount: 0,
        waitlistCount: 0,
      };

      return {
        eventId: row.event_id,
        title: event.title,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        category: event.category,
        priceCents: row.price_cents,
        currency: row.currency,
        capacity: row.capacity,
        registrationCount: counts.registrationCount,
        waitlistCount: counts.waitlistCount,
        approvalRequired: row.approval_required ?? false,
        householdRegistrationEnabled: row.household_registration_enabled ?? false,
        deadline: row.deadline,
        fields: fieldsByEvent.get(row.event_id) ?? [],
      } satisfies PublicEventRegistrationOption;
    })
    .filter((option): option is PublicEventRegistrationOption => option !== null)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}