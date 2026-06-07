'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SemanticButton, useGdsConfirm, useGdsToasts } from '@doneisbetter/gds-core/client';

type RemovalLevel = 'event' | 'partner';

interface RemoveSubmissionButtonProps {
  submissionId: string;
  level: RemovalLevel;
  contextId: string;
  contextName: string;
  onSuccess?: () => void;
}

export default function RemoveSubmissionButton({
  submissionId,
  level,
  contextId,
  contextName,
  onSuccess,
}: RemoveSubmissionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { confirm } = useGdsConfirm();
  const { notifyError } = useGdsToasts();

  const dialogMessages = {
    event: {
      title: 'Remove from event?',
      message: `Remove this photo from ${contextName}? It will remain in the database and can be re-added later.`,
      confirmLabel: 'Remove from event',
    },
    partner: {
      title: 'Remove from partner?',
      message: `Remove this photo from ${contextName} and all its events? The photo will be hidden but remain in the database.`,
      confirmLabel: 'Remove from partner',
    },
  };

  const { title, message, confirmLabel } = dialogMessages[level];

  const handleRemove = async () => {
    setIsLoading(true);

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

      if (onSuccess) {
        onSuccess();
      } else {
        router.refresh();
      }
    } catch (removeError) {
      notifyError({
        title: 'Remove failed',
        message: removeError instanceof Error ? removeError.message : 'Unknown error',
      });
      setIsLoading(false);
    }
  };

  const confirmRemove = async () => {
    const confirmed = await confirm({
      title,
      message,
      confirmAction: 'delete',
      danger: false,
    });
    if (confirmed) {
      void handleRemove();
    }
  };

  return (
    <SemanticButton
      action="delete"
      size="xs"
      loading={isLoading}
      disabled={isLoading}
      onClick={() => void confirmRemove()}
      aria-label={confirmLabel}
    >
      {level === 'event' ? 'Remove from Event' : 'Remove from Partner'}
    </SemanticButton>
  );
}
