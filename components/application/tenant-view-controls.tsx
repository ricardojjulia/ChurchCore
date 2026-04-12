"use client";

import { Eye, Undo2 } from "lucide-react";
import { Button, Group, Select } from "@mantine/core";
import { useState } from "react";

import {
  launchTenantViewAction,
  returnToControlPlaneAction,
} from "@/app/control/actions";
import type { ChurchRoleId, TenantViewTarget } from "@/lib/auth";

const roleOptions = [
  { value: "church-admin", label: "ChurchAdmin" },
  { value: "pastor", label: "Pastor / Elder" },
  { value: "ministry-leader", label: "Ministry Leader" },
  { value: "member", label: "Volunteer / Member" },
] as const;

export function TenantViewLauncher({ church }: { church: TenantViewTarget }) {
  const [roleId, setRoleId] = useState<ChurchRoleId>("church-admin");
  const launchDisabled =
    church.connectionStatus !== "ready" || !church.runtimeChurchId;

  return (
    <form action={launchTenantViewAction}>
      <input type="hidden" name="tenantId" value={church.tenantId} />
      <input type="hidden" name="roleId" value={roleId} />
      <Group gap="sm" wrap="wrap" justify="flex-end">
        <Select
          aria-label={`View ${church.name} as role`}
          data={roleOptions}
          value={roleId}
          onChange={(value) => setRoleId((value as ChurchRoleId) ?? "church-admin")}
          size="sm"
          radius="xl"
          w={190}
          disabled={launchDisabled}
        />
        <Button
          type="submit"
          radius="xl"
          size="sm"
          leftSection={<Eye size={15} />}
          disabled={launchDisabled}
        >
          View tenant
        </Button>
      </Group>
    </form>
  );
}

export function ReturnToControlPlaneButton() {
  return (
    <form action={returnToControlPlaneAction}>
      <Button
        type="submit"
        radius="xl"
        size="sm"
        variant="default"
        leftSection={<Undo2 size={15} />}
      >
        Return to control
      </Button>
    </form>
  );
}
