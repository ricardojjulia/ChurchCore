import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type MemberEventRegistrationField = {
  id: string;
  eventId: string;
  label: string;
  fieldKey: string;
  fieldType: "text" | "textarea" | "select" | "checkbox" | "number";
  isRequired: boolean;
  options: string[];
  sortOrder: number;
};

export type MemberEventRegistrationOption = {
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
  memberRegistrationStatus: "pending_approval" | "confirmed" | "waitlisted" | "attended" | null;
  fields: MemberEventRegistrationField[];
};

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

export async function getMemberEventRegistrationOptions(
  session: ChurchAppSession,
): Promise<MemberEventRegistrationOption[]> {
  if (session.appContext.roleId !== "member") {
    return [];
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return [];
  }

  const churchId = session.appContext.church.id;
  const profileId = session.profile.id;

  if (shouldUseLocalTenantFallback()) {
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
      registration_count: number;
      waitlist_count: number;
      approval_required: boolean;
      household_registration_enabled: boolean;
      member_registration_status:
        | "pending_approval"
        | "confirmed"
        | "waitlisted"
        | "attended"
        | null;
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
         coalesce(
           count(reg.id) filter (where reg.is_waitlisted = false and reg.status != 'cancelled'),
           0
         )::int as registration_count,
         coalesce(
           count(reg.id) filter (where reg.is_waitlisted = true and reg.status != 'cancelled'),
           0
         )::int as waitlist_count,
         ${hasApprovalColumn ? "coalesce(settings.approval_required, false)" : "false"} as approval_required,
         ${hasHouseholdColumn ? "coalesce(settings.household_registration_enabled, false)" : "false"} as household_registration_enabled,
         (
           select status::text
           from public.event_registrations member_reg
           where member_reg.event_id = event.id
             and member_reg.profile_id = $2
             and member_reg.status != 'cancelled'
           order by member_reg.registered_at desc
           limit 1
         ) as member_registration_status
       from public.event_registration_settings settings
       join public.events event
         on event.id = settings.event_id
       left join public.event_registrations reg
         on reg.event_id = event.id
         and reg.church_id = event.church_id
       where settings.church_id = $1
         and settings.registration_open = true
         and event.visibility in ('public', 'members')
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
      [churchId, profileId],
    );

    const fieldsResult = hasFormFieldsTable
      ? await queryTenantLocalDb<{
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
      : { rows: [] as Array<{
          id: string;
          event_id: string;
          label: string;
          field_key: string;
          field_type: string;
          is_required: boolean;
          options: string[] | null;
          sort_order: number;
        }> };

    const fieldsByEvent = fieldsResult.rows.reduce(
      (map, row) => {
        const field: MemberEventRegistrationField = {
          id: row.id,
          eventId: row.event_id,
          label: row.label,
          fieldKey: row.field_key,
          fieldType: (row.field_type as MemberEventRegistrationField["fieldType"]) ?? "text",
          isRequired: row.is_required,
          options: row.options ?? [],
          sortOrder: row.sort_order,
        };

        const existing = map.get(row.event_id) ?? [];
        existing.push(field);
        map.set(row.event_id, existing);
        return map;
      },
      new Map<string, MemberEventRegistrationField[]>(),
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
      memberRegistrationStatus: row.member_registration_status,
      fields: fieldsByEvent.get(row.event_id) ?? [],
    }));
  }

  const supabase = await createTenantServerClient();

  const settingsQuery = await supabase
    .from("event_registration_settings")
    .select(
      "event_id, price_cents, currency, capacity, deadline, waitlist_enabled, approval_required, household_registration_enabled, events!inner(id, title, starts_at, ends_at, category, visibility, church_id)",
    )
    .eq("church_id", churchId)
    .eq("registration_open", true)
    .in("events.visibility", ["public", "members"]);

  const registrationsQuery = await supabase
    .from("event_registrations")
    .select("event_id, status, is_waitlisted, profile_id, registered_at")
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
      church_id: string;
    }>;
  }>;

  const memberRegistrations = (registrationsQuery.data ?? []) as Array<{
    event_id: string;
    status: "pending_approval" | "confirmed" | "waitlisted" | "attended";
    is_waitlisted: boolean;
    profile_id: string | null;
    registered_at: string;
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

  const countsByEvent = memberRegistrations.reduce(
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

  const memberStatusByEvent = memberRegistrations
    .filter((row) => row.profile_id === profileId)
    .sort((left, right) => right.registered_at.localeCompare(left.registered_at))
    .reduce((map, row) => {
      if (!map.has(row.event_id)) {
        map.set(row.event_id, row.status);
      }
      return map;
    }, new Map<string, MemberEventRegistrationOption["memberRegistrationStatus"]>());

  const fieldsByEvent = fieldRows.reduce(
    (map, row) => {
      const field: MemberEventRegistrationField = {
        id: row.id,
        eventId: row.event_id,
        label: row.label,
        fieldKey: row.field_key,
        fieldType: (row.field_type as MemberEventRegistrationField["fieldType"]) ?? "text",
        isRequired: row.is_required,
        options: row.options ?? [],
        sortOrder: row.sort_order,
      };
      const existing = map.get(row.event_id) ?? [];
      existing.push(field);
      map.set(row.event_id, existing);
      return map;
    },
    new Map<string, MemberEventRegistrationField[]>(),
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
        memberRegistrationStatus: memberStatusByEvent.get(row.event_id) ?? null,
        fields: fieldsByEvent.get(row.event_id) ?? [],
      } satisfies MemberEventRegistrationOption;
    })
    .filter((option): option is MemberEventRegistrationOption => option !== null)
    .filter((option) => {
      const startsAt = new Date(option.startsAt).getTime();
      const lowerBound = Date.now() - 24 * 60 * 60 * 1000;
      const upperBound = Date.now() + 60 * 24 * 60 * 60 * 1000;
      return startsAt >= lowerBound && startsAt <= upperBound;
    })
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}
