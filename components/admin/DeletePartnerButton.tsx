'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { notifications } from '@/lib/gds/notifications';
import { confirmDestructive } from '@/lib/gds/confirm-destructive';

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
      const message = getErrorMessage(deleteError);
      setError(message);
      notifications.show({ title: 'Delete failed', message, color: 'red' });
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
    <>
      {error ? (
        <Alert color="red" icon={<IconAlertCircle size={16} />} mb="md">
          <Text fw={700}>Error</Text>
          <Text size="sm">{error}</Text>
        </Alert>
      ) : null}
      <Button
        color="red"
        loading={isDeleting}
        disabled={isDeleting}
        onClick={() =>
          confirmDestructive({
            title: 'Delete partner',
            message: 'Are you sure you want to delete this partner? This action cannot be undone.',
            targetName: partnerName,
            onConfirm: () => void handleDelete(),
          })
        }
      >
        Delete Partner
      </Button>
    </>
  );
}
