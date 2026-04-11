/**
 * Remove Submission Button Component
 * 
 * Reusable client component for removing submissions at different levels:
 * - Event level: Remove from specific event
 * - Partner level: Hide from partner and all events
 * 
 * Features confirmation dialog with clear messaging about action scope.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type RemovalLevel = 'event' | 'partner';

interface RemoveSubmissionButtonProps {
  submissionId: string;
  level: RemovalLevel;
  contextId: string; // eventId or partnerId
  contextName: string; // event name or partner name
  onSuccess?: () => void;
  className?: string;
}

export default function RemoveSubmissionButton({
  submissionId,
  level,
  contextId,
  contextName,
  onSuccess,
  className = 'text-red-600 hover:text-red-800 text-sm font-medium'
}: RemoveSubmissionButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleRemove = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const endpoint = level === 'event'
        ? `/api/events/${contextId}/submissions/${submissionId}` // eventId/submissionId
        : `/api/partners/${contextId}/submissions/${submissionId}`; // partnerId/submissionId

      const response = await fetch(endpoint, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove submission');
      }

      // Success
      setIsDialogOpen(false);
      if (onSuccess) {
        onSuccess();
      } else {
        // Default: refresh page
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsLoading(false);
    }
  };

  const dialogMessages = {
    event: {
      title: 'Remove from Event?',
      message: `Remove this photo from ${contextName}? It will remain in the database and can be re-added to the event later.`,
      button: 'Remove from Event'
    },
    partner: {
      title: 'Remove from Partner?',
      message: `Remove this photo from ${contextName} and all its events? The photo will be hidden but remain in the database.`,
      button: 'Remove from Partner'
    }
  };

  const { title, message, button } = dialogMessages[level];

  return (
    <>
      <button
        onClick={() => setIsDialogOpen(true)}
        className={className}
        disabled={isLoading}
      >
        {level === 'event' ? 'Remove from Event' : 'Remove from Partner'}
      </button>

      {/* Confirmation Dialog */}
      {isDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              {title}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {message}
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setIsDialogOpen(false);
                  setError(null);
                }}
                disabled={isLoading}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={isLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Removing...' : button}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
