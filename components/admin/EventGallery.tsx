/**
 * Event Gallery Client Component
 *
 * Client-side wrapper for event submission gallery with inline remove and bulk selection.
 */

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import EventGalleryUpload from './EventGalleryUpload';

interface SlideshowPlayInfo {
  count: number;
}

interface SubmissionRecord {
  _id: string;
  imageUrl?: string;
  finalImageUrl?: string;
  userName?: string;
  userEmail?: string;
  createdAt: string;
  playCount?: number;
  slideshowPlays?: Record<string, SlideshowPlayInfo | undefined>;
}

interface SlideshowRecord {
  slideshowId: string;
  name: string;
}

interface EventGalleryProps {
  eventId: string;
  eventName: string;
  initialSubmissions: SubmissionRecord[];
  slideshows: SlideshowRecord[];
}

type RemoveState = {
  singleConfirmId: string | null;
  bulkConfirm: boolean;
  busyIds: string[];
  error: string | null;
};

function submissionIdOf(submission: SubmissionRecord): string {
  return submission._id.toString();
}

export default function EventGallery({
  eventId,
  eventName,
  initialSubmissions,
  slideshows
}: EventGalleryProps) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [removeState, setRemoveState] = useState<RemoveState>({
    singleConfirmId: null,
    bulkConfirm: false,
    busyIds: [],
    error: null,
  });

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleIds = useMemo(
    () => submissions.map((submission) => submissionIdOf(submission)),
    [submissions]
  );
  const allSelected =
    allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedSet.has(id));

  const handleRemoveSuccess = (submissionIds: string[]) => {
    const idSet = new Set(submissionIds);
    setSubmissions((prev) =>
      prev.filter((submission) => !idSet.has(submissionIdOf(submission)))
    );
    setSelectedIds((prev) => prev.filter((id) => !idSet.has(id)));
    setRemoveState({
      singleConfirmId: null,
      bulkConfirm: false,
      busyIds: [],
      error: null,
    });
  };

  const handleUploaded = (submission: Record<string, unknown>) => {
    setSubmissions((prev) => [submission as unknown as SubmissionRecord, ...prev].slice(0, 50));
  };

  const toggleSelected = (submissionId: string) => {
    setSelectedIds((prev) =>
      prev.includes(submissionId)
        ? prev.filter((id) => id !== submissionId)
        : [...prev, submissionId]
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : allVisibleIds);
    setRemoveState((prev) => ({
      ...prev,
      bulkConfirm: false,
      error: null,
    }));
  };

  const removeFromEvent = async (submissionIds: string[]) => {
    if (submissionIds.length === 0) return;

    setRemoveState((prev) => ({
      ...prev,
      busyIds: submissionIds,
      error: null,
    }));

    try {
      const response = await fetch(
        `/api/events/${eventId}/submissions/bulk-remove`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionIds }),
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : typeof data.message === 'string'
              ? data.message
              : 'Failed to remove submissions from event'
        );
      }

      handleRemoveSuccess(submissionIds);
    } catch (error) {
      setRemoveState((prev) => ({
        ...prev,
        busyIds: [],
        error:
          error instanceof Error
            ? error.message
            : 'Failed to remove submissions from event',
      }));
    }
  };

  const startSingleConfirm = (submissionId: string) => {
    setRemoveState((prev) => ({
      ...prev,
      singleConfirmId: submissionId,
      error: null,
    }));
  };

  const cancelSingleConfirm = () => {
    setRemoveState((prev) => ({
      ...prev,
      singleConfirmId: null,
      error: null,
    }));
  };

  const startBulkConfirm = () => {
    setRemoveState((prev) => ({
      ...prev,
      bulkConfirm: true,
      error: null,
    }));
  };

  const cancelBulkConfirm = () => {
    setRemoveState((prev) => ({
      ...prev,
      bulkConfirm: false,
      error: null,
    }));
  };

  if (submissions.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <EventGalleryUpload
          eventMongoId={eventId}
          onUploaded={handleUploaded}
        />
        <div className="p-12 text-center border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="text-5xl mb-4">📸</div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No submissions yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Upload images above or open the public capture page for guests
          </p>
          <Link
            href={`/capture/${eventId}`}
            className="inline-flex px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            📸 Start Capturing
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <EventGalleryUpload
        eventMongoId={eventId}
        onUploaded={handleUploaded}
      />

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Gallery actions
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Select multiple images and remove them from {eventName} in one action.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="px-3 py-2 text-sm font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {allSelected ? 'Clear selection' : 'Select all visible'}
            </button>
            {selectedIds.length > 0 ? (
              removeState.bulkConfirm ? (
                <>
                  <button
                    type="button"
                    onClick={() => void removeFromEvent(selectedIds)}
                    disabled={removeState.busyIds.length > 0}
                    className="px-3 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {removeState.busyIds.length > 0
                      ? 'Removing selected…'
                      : `Confirm remove ${selectedIds.length}`}
                  </button>
                  <button
                    type="button"
                    onClick={cancelBulkConfirm}
                    disabled={removeState.busyIds.length > 0}
                    className="px-3 py-2 text-sm font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={startBulkConfirm}
                  className="px-3 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Remove selected ({selectedIds.length})
                </button>
              )
            ) : null}
          </div>
        </div>

        {removeState.error ? (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400">
            {removeState.error}
          </p>
        ) : null}
      </div>

      <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4">
        {submissions.map((submission) => {
          const submissionId = submissionIdOf(submission);
          const selected = selectedSet.has(submissionId);
          const singleConfirm = removeState.singleConfirmId === submissionId;
          const busy = removeState.busyIds.includes(submissionId);

          return (
            <div
              key={submissionId}
              className={`group relative bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden transition-all mb-4 break-inside-avoid ${
                selected ? 'ring-2 ring-emerald-500' : 'hover:ring-2 hover:ring-blue-500'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleSelected(submissionId)}
                className="absolute left-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/75 text-white backdrop-blur-sm"
                aria-pressed={selected}
                aria-label={selected ? 'Deselect image' : 'Select image'}
              >
                {selected ? '✓' : ''}
              </button>

              <Link href={`/share/${submission._id}`}>
                <Image
                  src={submission.imageUrl || submission.finalImageUrl || 'data:image/gif;base64,R0lGODlhAQABAAAAACw='}
                  alt={`Photo by ${submission.userName || submission.userEmail}`}
                  width={800}
                  height={800}
                  unoptimized
                  className="w-full h-auto"
                />
              </Link>

              {(typeof submission.playCount === 'number' && submission.playCount > 0) && (
                <div className="absolute top-2 right-2 bg-black/80 backdrop-blur-sm px-2 py-1 rounded-full">
                  <span className="text-white text-xs font-bold">▶ {submission.playCount}×</span>
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-white text-xs font-medium truncate">
                    {submission.userName || submission.userEmail}
                  </p>
                  <p className="text-white/80 text-xs">
                    {new Date(submission.createdAt).toLocaleDateString()}
                  </p>

                  {submission.slideshowPlays && Object.keys(submission.slideshowPlays).length > 0 && (
                    <div className="mt-2 space-y-1">
                      {slideshows.map((slideshow) => {
                        const plays = submission.slideshowPlays?.[slideshow.slideshowId];
                        if (!plays || plays.count === 0) return null;
                        return (
                          <p key={slideshow.slideshowId} className="text-white/90 text-xs font-semibold">
                            🎬 {slideshow.name}: {plays.count}×
                          </p>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    <Link
                      href={`/share/${submission._id}`}
                      className="flex-1 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors text-center"
                    >
                      View
                    </Link>
                    {singleConfirm ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void removeFromEvent([submissionId])}
                          disabled={busy}
                          className="flex-1 px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-50 transition-colors text-center"
                        >
                          {busy ? 'Removing…' : 'Confirm remove'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelSingleConfirm}
                          disabled={busy}
                          className="px-2 py-1 bg-white/20 text-white text-xs rounded hover:bg-white/30 transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startSingleConfirm(submissionId)}
                        className="flex-1 px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors text-center"
                      >
                        Remove from Event
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {submissions.length >= 50 && (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
          Showing the 50 most recent submissions
        </p>
      )}
    </div>
  );
}
