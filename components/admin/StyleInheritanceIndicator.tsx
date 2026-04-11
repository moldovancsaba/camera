'use client';

/**
 * Style Inheritance Indicator Component
 * 
 * Shows inheritance status (child/orphan) with emoji indicators
 * Provides reset button for orphaned styles
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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

      // Refresh the page to show updated values
      router.refresh();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-lg" title={isOverridden ? 'Custom' : `Using ${partnerName} default`}>
        {isOverridden ? '🔴' : '🟢'}
      </span>
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {isOverridden ? 'Custom' : `From ${partnerName}`}
      </span>
      {isOverridden && (
        <button
          onClick={handleReset}
          disabled={isResetting}
          className="ml-2 px-2 py-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isResetting ? 'Resetting...' : 'Reset to Partner Default'}
        </button>
      )}
    </div>
  );
}
