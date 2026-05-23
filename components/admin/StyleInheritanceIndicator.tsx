'use client';

/**
 * Style Inheritance Indicator Component
 *
 * Shows inheritance status with emoji indicators and provides a reset action.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Group, Text } from '@mantine/core';

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

  const fieldNames = {
    brandColors: 'Brand Colors',
    frames: 'Assigned Frames',
    logos: 'Event Logos',
  };

  function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Failed to reset style';
  }

  const handleReset = async () => {
    if (!confirm(`Reset ${fieldNames[styleField]} to ${partnerName}'s default?`)) {
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
      alert(`Error: ${getErrorMessage(error)}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Group gap="xs">
      <Text size="lg" title={isOverridden ? 'Custom' : `Using ${partnerName} default`}>
        {isOverridden ? '🔴' : '🟢'}
      </Text>
      <Text size="xs" c="dimmed">
        {isOverridden ? 'Custom' : `From ${partnerName}`}
      </Text>
      {isOverridden ? (
        <Button variant="subtle" size="compact-xs" onClick={handleReset} loading={isResetting}>
          {isResetting ? 'Resetting...' : 'Reset to Partner Default'}
        </Button>
      ) : null}
    </Group>
  );
}
