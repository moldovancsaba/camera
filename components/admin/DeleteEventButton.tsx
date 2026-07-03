'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SemanticButton, useGdsConfirm, useGdsToasts } from '@sovereignsquad/gds-core/client';

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
  const { confirmDestructive } = useGdsConfirm();
  const { notifyError } = useGdsToasts();

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
      notifyError({
        title: 'Delete failed',
        message: getErrorMessage(error),
      });
      setIsDeleting(false);
    }
  };

  const confirmDelete = async () => {
    const confirmed = await confirmDestructive({
      title: 'Delete event',
      message: 'Are you sure you want to delete this event? This action cannot be undone.',
      targetName: eventName,
    });
    if (confirmed) {
      void handleDelete();
    }
  };

  return (
    <SemanticButton
      action="delete"
      disabled={isDeleting}
      loading={isDeleting}
      onClick={() => void confirmDelete()}
    >
      Delete Event
    </SemanticButton>
  );
}
