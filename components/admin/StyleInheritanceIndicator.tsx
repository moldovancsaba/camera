'use client';

/**
 * Style Inheritance Indicator Component
 *
 * Shows inheritance status with emoji indicators and provides a reset action.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SemanticButton, useGdsConfirm, useGdsToasts } from '@doneisbetter/gds-core/client';

interface StyleInheritanceIndicatorProps {
  styleField: 'brandColors' | 'frames' | 'logos';
  isOverridden: boolean;
  eventId: string;
  partnerName: string;
}

export default function StyleInheritanceIndicator({
  styleField,
  isOverridden,
  eventId,
  partnerName,
}: StyleInheritanceIndicatorProps) {
  const router = useRouter();
  const [isResetting, setIsResetting] = useState(false);
  const { confirm } = useGdsConfirm();
  const { notifyError } = useGdsToasts();

  const fieldNames = {
    brandColors: 'Brand Colors',
    frames: 'Assigned Frames',
    logos: 'Event Logos',
  };

  function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Failed to reset style';
  }

  const handleReset = async () => {
    const confirmed = await confirm({
      title: 'Reset style inheritance',
      message: `Reset ${fieldNames[styleField]} to ${partnerName}'s default?`,
      confirmAction: 'reset',
    });
    if (!confirmed) {
      return;
    }

    setIsResetting(true);
    try {
      const response = await fetch(`/api/events/${eventId}/reset-style`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ styleField }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reset style');
      }

      router.refresh();
    } catch (error: unknown) {
      notifyError({ title: 'Reset failed', message: getErrorMessage(error) });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 'var(--mantine-spacing-xs)' }}>
      <span title={isOverridden ? 'Custom' : `Using ${partnerName} default`}>
        {isOverridden ? '🔴' : '🟢'}
      </span>
      <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)' }}>
        {isOverridden ? 'Custom' : `From ${partnerName}`}
      </span>
      {isOverridden ? (
        <SemanticButton action="reset" size="xs" onClick={() => void handleReset()} loading={isResetting}>
          {isResetting ? 'Resetting...' : 'Reset to Partner Default'}
        </SemanticButton>
      ) : null}
    </div>
  );
}
