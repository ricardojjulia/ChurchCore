"use client";

import { useState, useTransition } from "react";
import { Eye, Undo2 } from "lucide-react";
import { Button, Group, Select, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";

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

export function TenantViewLauncher({
  church,
  isPreview = false,
}: {
  church: TenantViewTarget;
  isPreview?: boolean;
}) {
  const [roleId, setRoleId] = useState<ChurchRoleId>("church-admin");
  const [isPending, startTransition] = useTransition();

  const notReady = church.connectionStatus !== "ready" || !church.runtimeChurchId;
  const launchDisabled = notReady || isPreview || isPending;

  function handleLaunch() {
    if (launchDisabled) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("tenantId", church.tenantId);
      formData.set("roleId", roleId);
      try {
        await launchTenantViewAction(formData);
      } catch (err) {
        // redirect() throws a NEXT_REDIRECT error — this is success, not failure.
        // Re-throw so Next.js can complete the navigation.
        const digest = (err as { digest?: string }).digest ?? "";
        if (digest.startsWith("NEXT_REDIRECT")) throw err;

        notifications.show({
          title: "Cannot launch tenant view",
          message:
            err instanceof Error
              ? err.message
              : "Tenant routing is unavailable.",
          color: "orange",
        });
      }
    });
  }

  const button = (
    <Button
      radius="xl"
      size="sm"
      leftSection={<Eye size={15} />}
      disabled={launchDisabled}
      loading={isPending}
      onClick={handleLaunch}
    >
      View tenant
    </Button>
  );

  return (
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
      {isPreview ? (
        <Tooltip label="Start Supabase locally to launch a tenant view" withArrow>
          <span>{button}</span>
        </Tooltip>
      ) : (
        button
      )}
    </Group>
  );
}

export function ReturnToControlPlaneButton() {
  const [isPending, startTransition] = useTransition();

  function handleReturn() {
    startTransition(async () => {
      try {
        await returnToControlPlaneAction();
      } catch (err) {
        const digest = (err as { digest?: string }).digest ?? "";
        if (digest.startsWith("NEXT_REDIRECT")) throw err;

        notifications.show({
          title: "Error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  return (
    <Button
      radius="xl"
      size="sm"
      variant="default"
      leftSection={<Undo2 size={15} />}
      loading={isPending}
      onClick={handleReturn}
    >
      Return to control
    </Button>
  );
}
