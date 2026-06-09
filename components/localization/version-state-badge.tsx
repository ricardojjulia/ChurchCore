"use client";

import { Badge } from "@mantine/core";

import type { VersionState } from "@/lib/localization-governance/types";

const STATE_COLOR: Record<VersionState, string> = {
  active: "green",
  stale: "yellow",
  draft: "blue",
  translated: "blue",
  validated: "blue",
  in_linguistic_review: "orange",
  in_domain_review: "orange",
  approved: "teal",
};

const STATE_LABEL: Record<VersionState, string> = {
  active: "active",
  stale: "stale",
  draft: "draft",
  translated: "translated",
  validated: "validated",
  in_linguistic_review: "linguistic review",
  in_domain_review: "domain review",
  approved: "approved",
};

export function VersionStateBadge({ state }: { state: VersionState | null }) {
  if (!state) {
    return (
      <Badge color="gray" variant="light" size="sm">
        inactive
      </Badge>
    );
  }

  return (
    <Badge color={STATE_COLOR[state]} variant="light" size="sm">
      {STATE_LABEL[state]}
    </Badge>
  );
}
