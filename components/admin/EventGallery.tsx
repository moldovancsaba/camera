/**
 * Event Gallery Client Component
 *
 * Client-side wrapper for event submission gallery with inline remove and bulk selection.
 */

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { InlineAlert, SemanticButton, StateBlock } from '@doneisbetter/gds-core/client';
import EventGalleryUpload from './EventGalleryUpload';

interface SlideshowPlayInfo {
  count: number;
}

interface SubmissionRecord {
  _id: string;
  imageUrl?: string;
  finalImageUrl?: string;
  userName?: string;
  userInfo?: {
    name?: string | null;
    email?: string | null;
  } | null;
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

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isLegacyGuestName(value: string): boolean {
  return value.trim().toLowerCase() === 'event guest';
}

function getDisplayName(submission: SubmissionRecord): string {
  const userInfoName = readString(submission.userInfo?.name);
  const userName = readString(submission.userName);

  if (userInfoName && !isLikelyEmail(userInfoName) && !isLegacyGuestName(userInfoName)) {
    return userInfoName;
  }
  if (userName && !isLikelyEmail(userName)) {
    return userName;
  }
  if (userInfoName || !userName || isLegacyGuestName(userName)) {
    return 'Guest';
  }
  return userName;
}

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
      <div style={{ display: 'grid', gap: '1.5rem', padding: '1.5rem' }}>
        <EventGalleryUpload
          eventMongoId={eventId}
          onUploaded={handleUploaded}
        />
        <StateBlock
          variant="empty"
          title="No submissions yet"
          description="Upload images above or open the public capture page for guests."
          action={
            <Link href={`/capture/${eventId}`} style={{ textDecoration: 'none' }}>
              <SemanticButton action="event-gallery:start-capturing">Start Capturing</SemanticButton>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '1.5rem', padding: '1.5rem' }}>
      <EventGalleryUpload
        eventMongoId={eventId}
        onUploaded={handleUploaded}
      />

      <section style={{ border: '1px solid var(--gds-color-border)', borderRadius: '1rem', padding: '1rem' }}>
        <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
          <div style={{ display: 'grid', gap: '0.25rem' }}>
            <strong style={{ fontSize: '0.875rem' }}>
              Gallery actions
            </strong>
            <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem', margin: 0 }}>
              Select multiple images and remove them from {eventName} in one action.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <SemanticButton
              action="event-gallery:toggle-select-all"
              type="button"
              onClick={toggleSelectAll}
              variant="secondary"
            >
              {allSelected ? 'Clear selection' : 'Select all visible'}
            </SemanticButton>
            {selectedIds.length > 0 ? (
              removeState.bulkConfirm ? (
                <>
                  <SemanticButton
                    action="event-gallery:confirm-bulk-remove"
                    type="button"
                    onClick={() => void removeFromEvent(selectedIds)}
                    disabled={removeState.busyIds.length > 0}
                    variant="danger"
                  >
                    {removeState.busyIds.length > 0
                      ? 'Removing selected…'
                      : `Confirm remove ${selectedIds.length}`}
                  </SemanticButton>
                  <SemanticButton
                    action="event-gallery:cancel-bulk-remove"
                    type="button"
                    onClick={cancelBulkConfirm}
                    disabled={removeState.busyIds.length > 0}
                    variant="secondary"
                  >
                    Cancel
                  </SemanticButton>
                </>
              ) : (
                <SemanticButton
                  action="event-gallery:start-bulk-remove"
                  type="button"
                  onClick={startBulkConfirm}
                  variant="danger"
                >
                  Remove selected ({selectedIds.length})
                </SemanticButton>
              )
            ) : null}
          </div>
        </div>

        {removeState.error ? (
          <div style={{ marginTop: '1rem' }}>
            <InlineAlert title="Remove failed" message={removeState.error} severity="error" />
          </div>
        ) : null}
      </section>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
        {submissions.map((submission) => {
          const submissionId = submissionIdOf(submission);
          const selected = selectedSet.has(submissionId);
          const singleConfirm = removeState.singleConfirmId === submissionId;
          const busy = removeState.busyIds.includes(submissionId);
          const displayName = getDisplayName(submission);

          return (
            <article
              key={submissionId}
              style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.875rem', overflow: 'hidden' }}
            >
              <div style={{ display: 'grid' }}>
                <div style={{ position: 'relative' }}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelected(submissionId)}
                    aria-label={selected ? 'Deselect image' : 'Select image'}
                    style={{ position: 'absolute', zIndex: 1, insetBlockStart: 8, insetInlineStart: 8 }}
                  />
                  <Link href={`/share/${submission._id}`}>
                  <Image
                  src={submission.imageUrl || submission.finalImageUrl || 'data:image/gif;base64,R0lGODlhAQABAAAAACw='}
                  alt={`Photo of ${displayName}`}
                  width={800}
                  height={800}
                  unoptimized
                      style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </Link>
                </div>

                <div style={{ display: 'grid', gap: '0.5rem', padding: '0.75rem' }}>
                  <strong style={{ fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName}
                  </strong>
                  <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem' }}>
                    {formatDateTime(submission.createdAt)}
                  </span>
                  {typeof submission.playCount === 'number' && submission.playCount > 0 ? (
                    <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem' }}>Played {submission.playCount} times</span>
                  ) : null}

                  {submission.slideshowPlays && Object.keys(submission.slideshowPlays).length > 0 && (
                    <div style={{ display: 'grid', gap: 2 }}>
                      {slideshows.map((slideshow) => {
                        const plays = submission.slideshowPlays?.[slideshow.slideshowId];
                        if (!plays || plays.count === 0) return null;
                        return (
                          <span key={slideshow.slideshowId} style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem' }}>
                            {slideshow.name}: {plays.count}x
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    <Link href={`/share/${submission._id}`} style={{ textDecoration: 'none' }}>
                      <SemanticButton action="event-gallery:view-submission" fullWidth size="xs" variant="secondary">View</SemanticButton>
                    </Link>
                    <a
                      href={submission.imageUrl || submission.finalImageUrl || undefined}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-disabled={!submission.imageUrl && !submission.finalImageUrl}
                      style={{ pointerEvents: !submission.imageUrl && !submission.finalImageUrl ? 'none' : undefined, textDecoration: 'none' }}
                    >
                      <SemanticButton action="event-gallery:download-submission" fullWidth size="xs" variant="secondary" disabled={!submission.imageUrl && !submission.finalImageUrl}>
                      Download
                      </SemanticButton>
                    </a>
                    {singleConfirm ? (
                      <>
                        <SemanticButton
                          action="event-gallery:confirm-remove"
                          type="button"
                          onClick={() => void removeFromEvent([submissionId])}
                          disabled={busy}
                          size="xs"
                          variant="danger"
                        >
                          {busy ? 'Removing…' : 'Confirm remove'}
                        </SemanticButton>
                        <SemanticButton
                          action="event-gallery:cancel-remove"
                          type="button"
                          onClick={cancelSingleConfirm}
                          disabled={busy}
                          size="xs"
                          variant="secondary"
                        >
                          Cancel
                        </SemanticButton>
                      </>
                    ) : (
                      <SemanticButton
                        action="event-gallery:start-remove"
                        type="button"
                        onClick={() => startSingleConfirm(submissionId)}
                        size="xs"
                        variant="danger"
                      >
                        Remove from Event
                      </SemanticButton>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {submissions.length >= 50 && (
        <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: 0, textAlign: 'center' }}>
          Showing the 50 most recent submissions
        </p>
      )}
    </div>
  );
}
