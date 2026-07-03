'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineAlert, useGdsConfirm, useGdsToasts } from '@sovereignsquad/gds-core/client';

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
  const { confirmDestructive } = useGdsConfirm();
  const { notifyError } = useGdsToasts();

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
      notifyError({ title: 'Delete failed', message });
      setIsDeleting(false);
    }
  };

  if (hasEvents) {
    return (
      <InlineAlert
        severity="warning"
        title="Cannot delete"
        message={`This partner has ${eventCount} event${eventCount !== 1 ? 's' : ''}. Delete all events first before deleting the partner.`}
      />
    );
  }

  const confirmDelete = async () => {
    const confirmed = await confirmDestructive({
      title: 'Delete partner',
      message: 'Are you sure you want to delete this partner? This action cannot be undone.',
      targetName: partnerName,
    });
    if (confirmed) {
      void handleDelete();
    }
  };

  return (
    <>
      {error ? (
        <InlineAlert severity="error" title="Error" message={error} />
      ) : null}
      <SemanticButton
        action="delete"
        loading={isDeleting}
        disabled={isDeleting}
        onClick={() => void confirmDelete()}
      >
        Delete Partner
      </SemanticButton>
    </>
  );
}
