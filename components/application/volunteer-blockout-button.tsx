"use client";

import { Button, Modal } from "@mantine/core";
import { CalendarX } from "lucide-react";
import { useState } from "react";

import { BlockoutDatesPanel } from "@/components/application/blockout-dates-panel";

/** Directory row control: opens a volunteer's unavailable dates for an admin. */
export function VolunteerBlockoutButton({ profileId, fullName }: { profileId: string; fullName: string }) {
  const [opened, setOpened] = useState(false);
  return (
    <>
      <Button
        size="xs"
        variant="subtle"
        leftSection={<CalendarX size={14} />}
        onClick={() => setOpened(true)}
        aria-label={`Unavailable dates for ${fullName}`}
      >
        Dates
      </Button>
      <Modal opened={opened} onClose={() => setOpened(false)} title={`Unavailable dates — ${fullName}`} size="lg" centered>
        {opened ? (
          <BlockoutDatesPanel target={{ kind: "admin", profileId, fullName }} initialDates={null} withTitle={false} />
        ) : null}
      </Modal>
    </>
  );
}
