/**
 * Event Gallery Client Component
 *
 * Client-side wrapper for event submission gallery with inline remove and bulk selection.
 *
 * Selecting several photos (camera#488, docs/_research/GALLERY_MULTISELECT_RESEARCH.md): a click on a checkbox, then a Shift+click on another selects everything between; Ctrl/Cmd+click
 * adds or takes one; dragging a box from the space between the pictures selects those it touches (Select mode makes a drag start anywhere, and works with a finger);
 * Ctrl/Cmd+A selects all shown, Esc clears. The rules are lib/gallery/selection.ts.
 */

'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { InlineAlert, ListingCard, StateBlock, type ListingMetadataRow } from '@sovereignsquad/gds-core/client';
import EventGalleryUpload from './EventGalleryUpload';
import { GALLERY_PAGE_SIZE } from '@/lib/gallery/page-size';
import { DRAG_THRESHOLD_PX, boxBetween, dragSelection, extendSelection, idsInBox, toggleId, type Box } from '@/lib/gallery/selection';

interface SlideshowPlayInfo {
  count: number;
}

interface SubmissionRecord {
  _id: string;
  imageUrl?: string;
  finalImageUrl?: string;
  previewImageUrl?: string | null;
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
  canManage?: boolean;
  /** The event has a frame to put on photos (camera#488). */
  hasFrame?: boolean;
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
  slideshows,
  canManage = true,
  hasFrame = false,
}: EventGalleryProps) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [dragBox, setDragBox] = useState<Box | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  /** The photo last clicked: where a Shift+click starts its range. */
  const anchorRef = useRef<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; before: string[]; additive: boolean; active: boolean } | null>(null);
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
    setSubmissions((prev) => [submission as unknown as SubmissionRecord, ...prev].slice(0, GALLERY_PAGE_SIZE));
  };

  /** A click on a checkbox or, with a modifier or in Select mode, on a picture: Shift extends from the last clicked photo, anything else toggles this one. */
  const selectClick = (submissionId: string, shift: boolean) => {
    const anchor = anchorRef.current;
    setSelectedIds((prev) => (shift && anchor ? extendSelection(prev, allVisibleIds, anchor, submissionId, prev.includes(anchor)) : toggleId(prev, submissionId)));
    if (!shift || !anchor) anchorRef.current = submissionId;
    setRemoveState((prev) => ({ ...prev, bulkConfirm: false, error: null }));
  };

  const cardBoxes = () =>
    [...(gridRef.current?.querySelectorAll<HTMLElement>('[data-gallery-id]') ?? [])].map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset.galleryId as string, box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } };
    });

  // A press on the space between the pictures (or anywhere in Select mode) followed by a move drags a box; the pictures it touches are selected.
  const onGridPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canManage || event.button !== 0) return;
    const target = event.target as HTMLElement;
    const onGap = event.target === event.currentTarget;
    if (!onGap && !(selectMode && !target.closest('button, input, select, textarea'))) return;
    dragRef.current = { x: event.clientX, y: event.clientY, before: selectedIds, additive: event.shiftKey || event.metaKey || event.ctrlKey, active: false };
  };
  const onGridPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_THRESHOLD_PX) return;
      drag.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const box = boxBetween({ x: drag.x, y: drag.y }, { x: event.clientX, y: event.clientY });
    setDragBox(box);
    setSelectedIds(dragSelection(drag.before, idsInBox(cardBoxes(), box), drag.additive));
  };
  const onGridPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragBox(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    // A plain click on the space between the pictures lets go of the selection.
    if (drag && !drag.active && !drag.additive && event.target === event.currentTarget) setSelectedIds([]);
  };

  // Ctrl/Cmd+A selects every shown photo while the focus is in the gallery; Esc lets go of the selection and leaves Select mode.
  useEffect(() => {
    if (!canManage) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedIds([]);
        setSelectMode(false);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && gridRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        setSelectedIds(allVisibleIds);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [canManage, allVisibleIds]);

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

  const [frameState, setFrameState] = useState<{ busy: boolean; message: string | null; error: string | null }>({ busy: false, message: null, error: null });

  // Puts the event's frame on the selected photos that were uploaded here (the server skips the others and says why), 25 at a time (camera#488).
  const frameSelected = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!confirm(`Add the event's frame to ${ids.length} photo${ids.length === 1 ? '' : 's'}? Only photos uploaded here that have no frame are changed; the plain upload is kept.`)) return;
    setFrameState({ busy: true, message: null, error: null });
    const framed: Array<{ id: string; imageUrl: string }> = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    try {
      for (let i = 0; i < ids.length; i += 25) {
        const response = await fetch(`/api/admin/events/${eventId}/gallery-frame`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionIds: ids.slice(i, i + 25) }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : typeof json.message === 'string' ? json.message : 'The frame could not be added');
        framed.push(...(json.data?.framed ?? []));
        skipped.push(...(json.data?.skipped ?? []));
      }
      const newUrl = new Map(framed.map((f) => [f.id, f.imageUrl]));
      setSubmissions((prev) => prev.map((s) => (newUrl.has(submissionIdOf(s)) ? { ...s, imageUrl: newUrl.get(submissionIdOf(s)), finalImageUrl: newUrl.get(submissionIdOf(s)), previewImageUrl: null } : s)));
      const why = [...new Set(skipped.map((s) => s.reason))].join('; ');
      setFrameState({ busy: false, message: `Framed ${framed.length} photo${framed.length === 1 ? '' : 's'}${skipped.length ? `; ${skipped.length} left as they were (${why})` : ''}.`, error: null });
    } catch (error) {
      setFrameState({ busy: false, message: null, error: error instanceof Error ? error.message : 'The frame could not be added' });
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
        {canManage ? (
          <EventGalleryUpload
            eventMongoId={eventId}
            onUploaded={handleUploaded}
            frameAvailable={hasFrame}
          />
        ) : null}
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
      {canManage ? (
        <EventGalleryUpload
          eventMongoId={eventId}
          onUploaded={handleUploaded}
          frameAvailable={hasFrame}
        />
      ) : null}

      {canManage ? (
      <section style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', padding: '1rem' }}>
        <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
          <div style={{ display: 'grid', gap: '0.25rem' }}>
            <strong style={{ fontSize: '0.875rem' }}>
              Gallery actions
            </strong>
            <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.75rem', margin: 0 }}>
              Select multiple images and remove them from {eventName} in one action. Click a checkbox, then Shift+click another to select everything between them; Ctrl/Cmd+click adds or takes one; drag a box from the space between the pictures to select those it touches (Select mode starts a drag anywhere and works with a finger); Ctrl/Cmd+A selects all shown, Esc clears.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <SemanticButton
              action="event-gallery:select-mode"
              type="button"
              onClick={() => setSelectMode((on) => !on)}
              variant={selectMode ? 'primary' : 'secondary'}
              aria-pressed={selectMode}
            >
              {selectMode ? 'Select mode: on' : 'Select mode'}
            </SemanticButton>
            <SemanticButton
              action="event-gallery:toggle-select-all"
              type="button"
              onClick={toggleSelectAll}
              variant="secondary"
            >
              {allSelected ? 'Clear selection' : 'Select all visible'}
            </SemanticButton>
            {selectedIds.length > 0 && hasFrame ? (
              <SemanticButton
                action="event-gallery:frame-selected"
                type="button"
                onClick={() => void frameSelected()}
                disabled={frameState.busy}
                variant="secondary"
              >
                {frameState.busy ? 'Adding the frame…' : `Add the frame to ${selectedIds.length} selected`}
              </SemanticButton>
            ) : null}
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
        {frameState.error ? (
          <div style={{ marginTop: '1rem' }}>
            <InlineAlert title="The frame was not added" message={frameState.error} severity="error" />
          </div>
        ) : null}
        {frameState.message ? (
          <div style={{ marginTop: '1rem' }}>
            <InlineAlert title="Frame" message={frameState.message} severity="info" />
          </div>
        ) : null}
      </section>
      ) : null}

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {selectedIds.length} selected
      </div>
      <div
        ref={gridRef}
        // A press that can start a dragged box must not start a text selection either.
        onMouseDown={(event) => {
          const target = event.target as HTMLElement;
          if (canManage && (event.target === event.currentTarget || (selectMode && !target.closest('button, input, select, textarea')))) {
            event.preventDefault();
            window.getSelection()?.removeAllRanges();
          }
        }}
        onPointerDown={onGridPointerDown}
        onPointerMove={onGridPointerMove}
        onPointerUp={onGridPointerEnd}
        onPointerCancel={onGridPointerEnd}
        style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', touchAction: selectMode ? 'none' : undefined, userSelect: dragBox ? 'none' : undefined }}
      >
        {submissions.map((submission) => {
          const submissionId = submissionIdOf(submission);
          const selected = selectedSet.has(submissionId);
          const singleConfirm = removeState.singleConfirmId === submissionId;
          const busy = removeState.busyIds.includes(submissionId);
          const displayName = getDisplayName(submission);

          const metadata: ListingMetadataRow[] = [
            { id: 'captured', label: 'Captured', value: formatDateTime(submission.createdAt), tone: 'muted' },
          ];
          if (typeof submission.playCount === 'number' && submission.playCount > 0) {
            metadata.push({ id: 'plays', label: 'Played', value: `${submission.playCount} times`, tone: 'muted' });
          }
          if (submission.slideshowPlays) {
            for (const slideshow of slideshows) {
              const plays = submission.slideshowPlays?.[slideshow.slideshowId];
              if (!plays || plays.count === 0) continue;
              metadata.push({ id: `ss-${slideshow.slideshowId}`, label: slideshow.name, value: `${plays.count}x`, tone: 'muted' });
            }
          }

          // Footer affordances kept as ReactNodes so SemanticButton loading/variant/confirm-flow survives.
          // ListingCard lays actions out in a wrapping Group and caps at 4 (throws at >4): View +
          // Download + the confirm/cancel pair = exactly 4, so do not add a 5th footer affordance here.
          // fullWidth is intentionally omitted — ListingCard wraps each action in a shrink-to-fit span.
          const actions: ReactNode[] = [
            <Link key="view" href={`/share/${submission._id}`} style={{ textDecoration: 'none' }}>
              <SemanticButton action="event-gallery:view-submission" size="xs" variant="secondary">View</SemanticButton>
            </Link>,
            <a
              key="download"
              href={submission.imageUrl || submission.finalImageUrl || undefined}
              download
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!submission.imageUrl && !submission.finalImageUrl}
              style={{ pointerEvents: !submission.imageUrl && !submission.finalImageUrl ? 'none' : undefined, textDecoration: 'none' }}
            >
              <SemanticButton action="event-gallery:download-submission" size="xs" variant="secondary" disabled={!submission.imageUrl && !submission.finalImageUrl}>
                Download
              </SemanticButton>
            </a>,
          ];
          if (canManage) {
            if (singleConfirm) {
              actions.push(
                <SemanticButton
                  key="confirm-remove"
                  action="event-gallery:confirm-remove"
                  type="button"
                  onClick={() => void removeFromEvent([submissionId])}
                  disabled={busy}
                  size="xs"
                  variant="danger"
                >
                  {busy ? 'Removing…' : 'Confirm remove'}
                </SemanticButton>,
                <SemanticButton
                  key="cancel-remove"
                  action="event-gallery:cancel-remove"
                  type="button"
                  onClick={cancelSingleConfirm}
                  disabled={busy}
                  size="xs"
                  variant="secondary"
                >
                  Cancel
                </SemanticButton>
              );
            } else {
              actions.push(
                <SemanticButton
                  key="start-remove"
                  action="event-gallery:start-remove"
                  type="button"
                  onClick={() => startSingleConfirm(submissionId)}
                  size="xs"
                  variant="danger"
                >
                  Remove from Event
                </SemanticButton>
              );
            }
          }

          return (
            <div
              key={submissionId}
              data-gallery-id={submissionId}
              style={{ outline: selected ? '3px solid var(--mantine-primary-color-filled)' : undefined, outlineOffset: 2, borderRadius: '0.875rem' }}
            >
            <ListingCard
              title={displayName}
              image={
                <div style={{ position: 'relative' }}>
                  {canManage ? (
                    <input
                      type="checkbox"
                      checked={selected}
                      onClick={(event) => selectClick(submissionId, event.shiftKey)}
                      onChange={() => undefined}
                      aria-label={selected ? 'Deselect image' : 'Select image'}
                      style={{ position: 'absolute', zIndex: 1, insetBlockStart: 8, insetInlineStart: 8 }}
                    />
                  ) : null}
                  <Link
                    href={`/share/${submission._id}`}
                    onClick={(event) => {
                      // With Shift or Ctrl/Cmd held, or in Select mode, a click on the picture selects it instead of opening it.
                      if (canManage && (selectMode || event.shiftKey || event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        selectClick(submissionId, event.shiftKey);
                      }
                    }}
                  >
                    <Image
                      src={submission.previewImageUrl || submission.imageUrl || submission.finalImageUrl || 'data:image/gif;base64,R0lGODlhAQABAAAAACw='}
                      alt={`Photo of ${displayName}`}
                      width={800}
                      height={800}
                      unoptimized
                      style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }}
                    />
                  </Link>
                </div>
              }
              metadata={metadata}
              actions={actions}
            />
            </div>
          );
        })}
      </div>

      {dragBox ? (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: dragBox.left,
            top: dragBox.top,
            width: dragBox.right - dragBox.left,
            height: dragBox.bottom - dragBox.top,
            border: '1px solid var(--mantine-primary-color-filled)',
            background: 'color-mix(in srgb, var(--mantine-primary-color-filled) 15%, transparent)',
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        />
      ) : null}

      {submissions.length >= GALLERY_PAGE_SIZE && (
        <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.875rem', margin: 0, textAlign: 'center' }}>
          Showing the {GALLERY_PAGE_SIZE} most recent submissions
        </p>
      )}
    </div>
  );
}
