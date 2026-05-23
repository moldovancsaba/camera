'use client';

/**
 * Reusable client component for removing submissions at different levels.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Group, Modal, Text } from '@mantine/core';

type RemovalLevel = 'event' | 'partner';

interface RemoveSubmissionButtonProps {
  submissionId: string;
  level: RemovalLevel;
  contextId: string;
  contextName: string;
  onSuccess?: () => void;
  className?: string;
}

export default function RemoveSubmissionButton({
  submissionId,
  level,
  contextId,
  contextName,
  onSuccess,
}: RemoveSubmissionButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleRemove = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const endpoint =
        level === 'event'
          ? `/api/events/${contextId}/submissions/${submissionId}`
          : `/api/partners/${contextId}/submissions/${submissionId}`;

      const response = await fetch(endpoint, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove submission');
      }

      setIsDialogOpen(false);
      if (onSuccess) {
        onSuccess();
      } else {
        router.refresh();
      }
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Unknown error');
      setIsLoading(false);
    }
  };

  const dialogMessages = {
    event: {
      title: 'Remove from Event?',
      message: `Remove this photo from ${contextName}? It will remain in the database and can be re-added to the event later.`,
      button: 'Remove from Event',
    },
    partner: {
      title: 'Remove from Partner?',
      message: `Remove this photo from ${contextName} and all its events? The photo will be hidden but remain in the database.`,
      button: 'Remove from Partner',
    },
  };

  const { title, message, button } = dialogMessages[level];

  return (
    <>
      <Button variant="subtle" color="red" size="compact-sm" onClick={() => setIsDialogOpen(true)} disabled={isLoading}>
        {level === 'event' ? 'Remove from Event' : 'Remove from Partner'}
      </Button>

      <Modal opened={isDialogOpen} onClose={() => setIsDialogOpen(false)} title={title} centered>
        <Text c="dimmed" mb="lg">
          {message}
        </Text>

        {error ? (
          <Alert color="red" mb="md">
            <Text size="sm">{error}</Text>
          </Alert>
        ) : null}

        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={() => {
              setIsDialogOpen(false);
              setError(null);
            }}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button color="red" onClick={() => void handleRemove()} loading={isLoading}>
            {isLoading ? 'Removing...' : button}
          </Button>
        </Group>
      </Modal>
    </>
  );
}
