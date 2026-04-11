/**
 * Delete Partner Button Component
 * 
 * Client component for deleting partners with confirmation dialog
 */

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface DeletePartnerButtonProps {
  partnerId: string;
  partnerName: string;
  hasEvents: boolean;
  eventCount?: number;
}

export default function DeletePartnerButton({
  partnerId,
  partnerName,
  hasEvents,
  eventCount = 0
}: DeletePartnerButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/partners/${partnerId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete partner');
      }

      // Redirect to partners list on success
      router.push('/admin/partners');
      router.refresh();
    } catch (err: any) {
      console.error('Delete partner error:', err);
      setError(err.message);
      setIsDeleting(false);
    }
  };

  if (hasEvents) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <p className="text-sm text-yellow-800 dark:text-yellow-200">
          <strong>Cannot delete:</strong> This partner has {eventCount} event{eventCount !== 1 ? 's' : ''}. 
          Delete all events first before deleting the partner.
        </p>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
          <p className="text-red-600 dark:text-red-300 text-sm mt-1">{error}</p>
        </div>
      )}

      {!showConfirm ? (
        <button
          onClick={() => setShowConfirm(true)}
          className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
        >
          Delete Partner
        </button>
      ) : (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-800 dark:text-red-200 font-medium mb-3">
            Are you sure you want to delete <strong>{partnerName}</strong>?
          </p>
          <p className="text-sm text-red-600 dark:text-red-300 mb-4">
            This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? 'Deleting...' : 'Yes, Delete'}
            </button>
            <button
              onClick={() => {
                setShowConfirm(false);
                setError(null);
              }}
              disabled={isDeleting}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
