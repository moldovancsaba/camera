'use client';

/**
 * Delete Partner Button Component
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

interface DeletePartnerButtonProps {
  partnerId: string;
  partnerName: string;
  hasEvents: boolean;
  eventCount?: number;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to delete partner';
}

export default function DeletePartnerButton({
  partnerId,
  partnerName,
  hasEvents,
  eventCount = 0,
}: DeletePartnerButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/partners/${partnerId}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete partner');
      }

      router.push('/admin/partners');
      router.refresh();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
      setIsDeleting(false);
    }
  };

  if (hasEvents) {
    return (
      <Alert color="yellow">
        <Text size="sm">
          <strong>Cannot delete:</strong> This partner has {eventCount} event{eventCount !== 1 ? 's' : ''}. Delete all
          events first before deleting the partner.
        </Text>
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {error ? (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          <Text fw={700}>Error</Text>
          <Text size="sm">{error}</Text>
        </Alert>
      ) : null}

      {!showConfirm ? (
        <Button color="red" onClick={() => setShowConfirm(true)}>
          Delete Partner
        </Button>
      ) : (
        <Alert color="red">
          <Text size="sm" fw={700} mb="sm">
            Are you sure you want to delete <strong>{partnerName}</strong>?
          </Text>
          <Text size="sm" mb="md">
            This action cannot be undone.
          </Text>
          <Group>
            <Button color="red" onClick={() => void handleDelete()} loading={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Yes, Delete'}
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setShowConfirm(false);
                setError(null);
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
          </Group>
        </Alert>
      )}
    </Stack>
  );
}
