"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ActionIcon, Button, Indicator, Modal, Select, Textarea, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { MessageSquare } from "lucide-react";

import { useDemoSession } from "@/lib/demo/context";
import { computeFingerprint } from "@/lib/demo/fingerprint";

const CATEGORIES = [
  { value: "BUG", label: "Bug" },
  { value: "ERROR", label: "Error" },
  { value: "UNEXPECTED_RESULT", label: "Unexpected Result" },
  { value: "IMPROVEMENT", label: "Improvement Idea" },
];

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { sessionId, breadcrumbs, getSessionDuration } = useDemoSession();
  const pathname = usePathname();

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    return null;
  }

  async function handleSubmit() {
    if (!category) return;

    setSubmitting(true);

    try {
      const fingerprint = await computeFingerprint(pathname ?? "", category, null);

      const payload = {
        session_id: sessionId,
        route: pathname ?? "",
        category,
        error_message: null,
        note: note.trim() || null,
        breadcrumbs,
        user_email: null,
        user_role: null,
        demo_version: process.env.NEXT_PUBLIC_DEMO_VERSION ?? "",
        fingerprint,
        session_duration: getSessionDuration(),
      };

      const res = await fetch("/api/demo/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setOpen(false);
        setCategory(null);
        setNote("");
        notifications.show({
          title: "Feedback sent",
          message: "",
          color: "teal",
          autoClose: 3000,
        });
      } else {
        throw new Error("Non-OK response");
      }
    } catch {
      notifications.show({
        title: "Failed to send",
        message: "Please try again.",
        color: "red",
        autoClose: 4000,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Tooltip
        label="Send feedback about this page"
        position="left"
        withArrow
        openDelay={300}
      >
        <Indicator
          color="red"
          size={10}
          processing
          style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999 }}
        >
          <ActionIcon
            size="xl"
            radius="xl"
            variant="filled"
            color="teal"
            aria-label="Send demo feedback"
            onClick={() => setOpen(true)}
          >
            <MessageSquare size={20} />
          </ActionIcon>
        </Indicator>
      </Tooltip>

      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title="Send Feedback"
        transitionProps={{ duration: 0 }}
      >
        <Select
          label="Category"
          required
          data={CATEGORIES}
          value={category}
          onChange={setCategory}
          mb="md"
        />
        <Textarea
          label="Notes"
          description="What did you observe?"
          maxLength={2000}
          autosize
          minRows={3}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          mb="md"
        />
        <Button
          fullWidth
          disabled={!category}
          loading={submitting}
          onClick={handleSubmit}
        >
          Send Feedback
        </Button>
      </Modal>
    </>
  );
}
