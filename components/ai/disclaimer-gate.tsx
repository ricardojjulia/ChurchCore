"use client";

import { useEffect, useId, useRef } from "react";
import { Button, Modal, Text } from "@mantine/core";

import { ELDER_AI_DISCLAIMER } from "@/lib/elders-types";

export type AiFeatureKey = "sermon_planning" | "bible_study";

const SESSION_KEY_PREFIX = "ai_disclaimer_";

function storageKey(featureKey: AiFeatureKey): string {
  return SESSION_KEY_PREFIX + featureKey;
}

export function DisclaimerGate({
  featureKey,
  onConfirm,
}: {
  featureKey: AiFeatureKey;
  onConfirm: () => void;
}) {
  const titleId = useId();
  // Track whether we've already acted on this render to avoid double-firing
  const confirmedRef = useRef(false);

  const alreadyShown =
    typeof window !== "undefined"
      ? sessionStorage.getItem(storageKey(featureKey)) === "shown"
      : false;

  useEffect(() => {
    if (alreadyShown && !confirmedRef.current) {
      confirmedRef.current = true;
      onConfirm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadyShown]);

  function handleConfirm() {
    sessionStorage.setItem(storageKey(featureKey), "shown");
    confirmedRef.current = true;
    onConfirm();
  }

  // If already shown, the effect fires onConfirm — render nothing visible
  if (alreadyShown) {
    return null;
  }

  return (
    <Modal
      opened={true}
      onClose={() => {
        // Intentionally empty — modal cannot be closed without confirming
      }}
      title={
        <Text id={titleId} fw={700} fz="md">
          AI Ministry Assistant
        </Text>
      }
      aria-labelledby={titleId}
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
      radius="lg"
      overlayProps={{ blur: 3 }}
    >
      <Text fz="sm" mb="sm">
        {ELDER_AI_DISCLAIMER}
      </Text>
      <Text fz="xs" c="dimmed" mb="xl">
        This tool uses the Anthropic Claude AI model.
      </Text>
      <Button fullWidth color="churchBlue" radius="xl" onClick={handleConfirm}>
        I Understand
      </Button>
    </Modal>
  );
}
