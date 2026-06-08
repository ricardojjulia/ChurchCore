"use client";

import { Button, Group, Modal, Text } from "@mantine/core";

export function OperationsConfirmDeleteModal({
  opened,
  title,
  onConfirm,
  onClose,
  loading,
}: {
  opened: boolean;
  title: string;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Delete document?"
      centered
      size="sm"
    >
      <Text size="sm" c="#617184" mb="lg">
        Are you sure you want to delete &quot;{title}&quot;? This cannot be undone.
      </Text>
      <Group justify="flex-end" gap="sm">
        <Button variant="default" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button color="red" onClick={onConfirm} loading={loading}>
          Delete
        </Button>
      </Group>
    </Modal>
  );
}
