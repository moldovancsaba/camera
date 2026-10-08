'use client';

/**
 * Style Inheritance Indicator Component
 *
 * Shows inheritance status with emoji indicators and provides a reset action.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SemanticButton, useGdsConfirm, useGdsToasts } from '@sovereignsquad/gds-core/client';
import CameraSemanticButton from '@/components/gds/CameraSemanticButton';

interface StyleInheritanceIndicatorProps {
  styleField: 'brandColors' | 'frames' | 'logos';
  isOverridden: boolean;
  eventId: string;
  partnerName: string;
  /** Brand colours: the event has no colours of its own, so it follows the messmass style (camera#380). */
  followsMessmass?: boolean;
  /** Brand colours: some colour is stored on the event (its own, or the default of its partner). */
  hasOwnValue?: boolean;
}

export default function StyleInheritanceIndicator({
  styleField,
  isOverridden,
  eventId,
  partnerName,
  followsMessmass = false,
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
      title: styleField === 'brandColors' ? 'Use the default colours' : 'Reset style inheritance',
      message:
        styleField === 'brandColors'
          ? `Remove the colours of this event? It will use the default colours of ${partnerName}, or the colours of its messmass style when ${partnerName} has none.`
          : `Reset ${fieldNames[styleField]} to ${partnerName}'s default?`,
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

  const source = isOverridden ? 'Custom' : followsMessmass && styleField === 'brandColors' ? 'From messmass' : `From ${partnerName}`;
  return (
    <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 'var(--mantine-spacing-xs)' }}>
      <span title={source}>{isOverridden ? '🔴' : '🟢'}</span>
      <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)' }}>{source}</span>
      {isOverridden && styleField === 'brandColors' ? (
        <CameraSemanticButton action="style-sections:use-default-colours" size="xs" onClick={() => void handleReset()} loading={isResetting}>
          Use the default colours
        </CameraSemanticButton>
      ) : null}
      {isOverridden && styleField !== 'brandColors' ? (
        <SemanticButton action="reset" size="xs" onClick={() => void handleReset()} loading={isResetting}>
          {isResetting ? 'Resetting...' : 'Reset to Partner Default'}
        </SemanticButton>
      ) : null}
    </div>
  );
}
