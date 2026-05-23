'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { confirmDestructive } from '@/lib/gds/confirm-destructive';

interface DeleteEventButtonProps {
  eventId: string;
  eventName: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to delete event';
}

export default function DeleteEventButton({ eventId, eventName }: DeleteEventButtonProps) {
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
      notifications.show({
        title: 'Delete failed',
        message: getErrorMessage(error),
        color: 'red',
      });
      setIsDeleting(false);
    }
  };

  return (
    <Button
      color="red"
      disabled={isDeleting}
      loading={isDeleting}
      onClick={() =>
        confirmDestructive({
          title: 'Delete event',
          message: 'Are you sure you want to delete this event? This action cannot be undone.',
          targetName: eventName,
          onConfirm: () => void handleDelete(),
        })
      }
    >
      Delete Event
    </Button>
  );
}
