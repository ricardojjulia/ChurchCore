"use client";

import { MultiSelect, NumberInput, Select, SimpleGrid } from "@mantine/core";

import type { CommunicationChannel, SegmentFilter } from "@/lib/communications-types";

const ROLE_OPTIONS = [
  { value: "church_admin", label: "Church Admin" },
  { value: "secretary", label: "Secretary" },
  { value: "pastor", label: "Pastor" },
  { value: "ministry_leader", label: "Ministry Leader" },
  { value: "member_volunteer", label: "Member / Volunteer" },
];

const MEMBERSHIP_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "visitor", label: "Visitor" },
  { value: "baptized", label: "Baptized" },
  { value: "transferred", label: "Transferred" },
];

export function CommunicationsAudienceBuilder({
  value,
  onChange,
  ministries,
}: {
  value: SegmentFilter;
  onChange: (v: SegmentFilter) => void;
  ministries: Array<{ id: string; name: string }>;
  channel: CommunicationChannel;
}) {
  const ministryOptions = ministries.map((m) => ({ value: m.id, label: m.name }));

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
      <Select
        label="Role"
        placeholder="All roles"
        clearable
        data={ROLE_OPTIONS}
        value={value.role ?? null}
        onChange={(v) => onChange({ ...value, role: v ?? undefined })}
      />

      <MultiSelect
        label="Ministry"
        placeholder="All ministries"
        clearable
        data={ministryOptions}
        value={value.ministryIds ?? []}
        onChange={(v) => onChange({ ...value, ministryIds: v.length > 0 ? v : undefined })}
        searchable
      />

      <Select
        label="Membership Status"
        placeholder="All statuses"
        clearable
        data={MEMBERSHIP_STATUS_OPTIONS}
        value={value.membershipStatus ?? null}
        onChange={(v) => onChange({ ...value, membershipStatus: v ?? undefined })}
      />

      <NumberInput
        label="Attended within (days)"
        placeholder="No filter"
        min={1}
        max={365}
        value={value.attendedWithinDays ?? ""}
        onChange={(v) =>
          onChange({
            ...value,
            attendedWithinDays: v === "" || v === 0 ? undefined : Number(v),
          })
        }
      />
    </SimpleGrid>
  );
}
