'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Group, Modal, Text } from '@mantine/core';

interface DeleteEventButtonProps {
  eventId: string;
  eventName: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to delete event';
}

export default function DeleteEventButton({ eventId, eventName }: DeleteEventButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/events/${eventId}`, { method: 'DELETE' });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete event');
      }

      router.push('/admin/events');
      router.refresh();
    } catch (error: unknown) {
      alert(`Error: ${getErrorMessage(error)}`);
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <Button color="red" onClick={() => setShowConfirm(true)} disabled={isDeleting}>
        Delete Event
      </Button>

      <Modal opened={showConfirm} onClose={() => setShowConfirm(false)} title="Delete Event" centered>
        <Text c="dimmed" mb="lg">
          Are you sure you want to delete <strong>{eventName}</strong>? This action cannot be undone.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setShowConfirm(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button color="red" onClick={() => void handleDelete()} loading={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </Group>
      </Modal>
    </>
  );
}
