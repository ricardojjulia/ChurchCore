"use client";

import { ActionIcon, Group, NumberInput, Text, Tooltip } from "@mantine/core";
import { Check } from "lucide-react";
import { useState, useTransition } from "react";

import { updateVolunteerFrequencyAction } from "@/app/app/volunteer-actions";

/**
 * Admin-set cap on how many services a volunteer is scheduled for per month.
 * Empty means no limit. The rotation planner treats it as a hard limit.
 */
export function VolunteerFrequencyInput({
  profileId,
  fullName,
  initialValue,
}: {
  profileId: string;
  fullName: string;
  initialValue: number | null;
}) {
  const [value, setValue] = useState<number | "">(initialValue ?? "");
  const [saved, setSaved] = useState<number | null>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const current = value === "" ? null : value;
  const dirty = current !== saved;

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateVolunteerFrequencyAction({ profileId, maxServicesPerMonth: current });
      if (res.ok) setSaved(current);
      else setError(res.error ?? "Could not save the monthly limit.");
    });
  }

  return (
    <Group gap={4} wrap="nowrap">
      <NumberInput
        size="xs"
        w={84}
        min={1}
        max={31}
        allowDecimal={false}
        placeholder="No limit"
        value={value}
        onChange={(next) => setValue(typeof next === "number" ? next : "")}
        aria-label={`Monthly limit for ${fullName}`}
        error={error ?? undefined}
      />
      {dirty && (
        <Tooltip label="Save monthly limit">
          <ActionIcon
            size="sm"
            variant="light"
            onClick={save}
            loading={isPending}
            aria-label={`Save monthly limit for ${fullName}`}
          >
            <Check size={14} />
          </ActionIcon>
        </Tooltip>
      )}
      {!dirty && saved !== null && (
        <Text size="xs" c="dimmed">
          /mo
        </Text>
      )}
    </Group>
  );
}
