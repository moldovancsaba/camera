'use client';

/**
 * The photo moderation queue of one event (camera#268, docs/PHOTO_VETTING_PLAN.md): the photos of a vetted event with approve and
 * reject, one at a time or selected in bulk. Each decision calls POST /api/admin/submissions/<id>/review; a photo leaves the list when
 * it is decided. Every control is a native button or checkbox, so the queue works from the keyboard. A decision locks only its own photo, so the
 * next photo can be decided while one is still being made, and the page is reloaded from the server after every decision, so the counts of the
 * tabs and the list always show what the server holds, also when an answer never arrives.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { InlineAlert, ListingCard, StateBlock, type ListingMetadataRow } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { TextInput } from '@/components/gds/PublicPrimitives';
import { WAITING_REFRESH_MS, shouldRefreshWaiting } from '@/lib/photo-vetting/auto-refresh';
import type { PhotoQueueItem, QueueStatus } from '@/lib/photo-vetting/queue';

interface PhotoReviewQueueProps {
  status: QueueStatus;
  initialItems: PhotoQueueItem[];
  canReview: boolean;
}

interface Notice {
  severity: 'success' | 'error' | 'warning';
  title: string;
  message: string;
}

interface ReviewAnswer {
  email?: 'sent' | 'skipped' | 'failed';
}

const BULK_CONCURRENCY = 2;
const FRAME_LABEL = { generated: 'Generated frame', own: 'Own frame', none: 'No frame' } as const;

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** No answer within this time: the decision may still have been made, so the list is reloaded instead of guessed. */
const REVIEW_ANSWER_TIMEOUT_MS = 120_000;

class NoAnswerError extends Error {
  constructor() {
    super('No answer arrived from the server. The photo may have been decided anyway; the list shows what the server holds now.');
  }
}

async function review(id: string, action: 'approve' | 'reject', reason?: string): Promise<ReviewAnswer> {
  let response: Response;
  try {
    response = await fetch(`/api/admin/submissions/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...(reason ? { reason } : {}) }),
      signal: AbortSignal.timeout(REVIEW_ANSWER_TIMEOUT_MS),
    });
  } catch {
    throw new NoAnswerError();
  }
  const body = (await response.json().catch(() => ({}))) as { error?: unknown; message?: unknown; data?: ReviewAnswer };
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : typeof body.message === 'string' ? body.message : `Server error ${response.status}`);
  }
  return body.data ?? {};
}

const emailNote = (answers: ReviewAnswer[]): string => {
  const failed = answers.filter((answer) => answer.email === 'failed').length;
  const skipped = answers.filter((answer) => answer.email === 'skipped').length;
  const parts = [failed ? `${failed} email${failed === 1 ? '' : 's'} could not be sent` : '', skipped ? `${skipped} had no email to send to` : ''].filter(Boolean);
  return parts.length ? ` (${parts.join(', ')})` : '';
};

export default function PhotoReviewQueue({ status, initialItems, canReview }: PhotoReviewQueueProps) {
  const router = useRouter();
  // Photos decided here leave the list at once; everything else comes from the server (initialItems is fresh after each router.refresh()).
  const [decided, setDecided] = useState<string[]>([]);
  const items = useMemo(() => initialItems.filter((item) => !decided.includes(item.id)), [initialItems, decided]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string[]>([]);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [progress, setProgress] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // The Waiting list asks the server for new photos by itself (camera#373), so an approver at the match does not have to reload the page.
  useEffect(() => {
    const timer = setInterval(() => {
      if (shouldRefreshWaiting({ status, hidden: document.visibilityState === 'hidden', deciding: busy.length > 0, rejecting: rejecting !== null })) router.refresh();
    }, WAITING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [status, busy.length, rejecting, router]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allIds = useMemo(() => items.map((item) => item.id), [items]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedSet.has(id));
  const working = busy.length > 0;
  const canDecide = canReview && status !== 'approved';

  const removeFromList = (ids: string[]) => {
    setDecided((current) => [...current, ...ids]);
    setSelected((current) => current.filter((id) => !ids.includes(id)));
  };
  const markBusy = (ids: string[]) => setBusy((current) => [...current, ...ids]);
  const markFree = (ids: string[]) => setBusy((current) => current.filter((id) => !ids.includes(id)));

  const approve = async (ids: string[]) => {
    setNotice(null);
    const done: string[] = [];
    const answers: ReviewAnswer[] = [];
    const failures: string[] = [];
    const queue = [...ids];
    markBusy(ids);
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        setProgress(ids.length > 1 ? `Approving ${done.length + failures.length + 1} of ${ids.length}…` : null);
        try {
          answers.push(await review(id, 'approve'));
          done.push(id);
          removeFromList([id]);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : 'The photo could not be approved');
        }
        markFree([id]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, ids.length) }, worker));
    setProgress(null);
    router.refresh();
    if (failures.length > 0) {
      setNotice({
        severity: 'error',
        title: done.length ? 'Some photos were not approved' : 'Not approved',
        message: `${done.length ? `${done.length} approved. ` : ''}${failures[0]}${failures.length > 1 ? ` (and ${failures.length - 1} more)` : ''}`,
      });
    } else {
      const note = emailNote(answers);
      setNotice({ severity: note ? 'warning' : 'success', title: done.length === 1 ? 'Photo approved' : `${done.length} photos approved`, message: `The user gets the link by email${note}.` });
    }
  };

  const reject = async (id: string) => {
    setNotice(null);
    markBusy([id]);
    try {
      const answer = await review(id, 'reject', reason.trim() || undefined);
      removeFromList([id]);
      setRejecting(null);
      setReason('');
      const note = emailNote([answer]);
      setNotice({ severity: note ? 'warning' : 'success', title: 'Photo rejected', message: `The user gets a short note${note}. The photo stays private.` });
    } catch (error) {
      setNotice({ severity: 'error', title: 'Not rejected', message: error instanceof Error ? error.message : 'The photo could not be rejected' });
    } finally {
      markFree([id]);
      router.refresh();
    }
  };

  if (items.length === 0) {
    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        {notice ? <InlineAlert title={notice.title} message={notice.message} severity={notice.severity} /> : null}
        <StateBlock
          variant="empty"
          title={status === 'pending_review' ? 'Nothing is waiting' : status === 'rejected' ? 'No rejected photos' : 'No approved photos yet'}
          description={status === 'pending_review' ? 'New photos of this event appear here until they are approved or rejected. This page looks for new photos by itself every 10 seconds.' : 'Photos appear here once they have been decided.'}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }} data-photo-review-queue>
      {canDecide ? (
        <section style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <SemanticButton action="photo-review:toggle-select-all" type="button" variant="secondary" onClick={() => setSelected(allSelected ? [] : allIds)} disabled={working}>
              {allSelected ? 'Clear selection' : 'Select all'}
            </SemanticButton>
            {selected.length > 0 ? (
              <SemanticButton action="photo-review:approve-selected" type="button" onClick={() => void approve(selected)} disabled={working}>
                {working ? (progress ?? 'Approving…') : 'Approve selected'}
              </SemanticButton>
            ) : null}
          </div>
          <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem' }}>
            {selected.length > 0 ? `${selected.length} selected. ` : ''}
            {status === 'pending_review' ? 'Oldest first. Looks for new photos every 10 seconds. ' : ''}
            {items.length} shown
          </span>
        </section>
      ) : null}

      {notice ? <InlineAlert title={notice.title} message={notice.message} severity={notice.severity} /> : null}

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))' }}>
        {items.map((item) => {
          const isBusy = busy.includes(item.id);
          const isRejecting = rejecting === item.id;
          const metadata: ListingMetadataRow[] = [
            { id: 'when', label: 'Taken', value: formatDateTime(item.createdAt), tone: 'muted' },
            { id: 'frame', label: 'Frame', value: FRAME_LABEL[item.frameKind], tone: 'muted' },
          ];
          if (item.email) metadata.unshift({ id: 'email', label: 'Email', value: item.email });
          // The buttons show their fixed labels, so the card itself says that a decision is being made (it can take a few seconds).
          if (isBusy) metadata.push({ id: 'working', label: 'Now', value: isRejecting ? 'Rejecting…' : 'Approving… please wait', tone: 'warning' });
          if (item.tryOnRequested) metadata.push({ id: 'tryon', label: 'Try-on', value: 'after approval', tone: 'muted' });
          if (item.status !== 'approved') metadata.push({ id: 'wall', label: 'Wall', value: item.shareOptIn ? 'shown' : 'private', tone: 'muted' });
          if (item.last) {
            metadata.push({ id: 'last', label: item.last.action === 'approve' ? 'Approved' : 'Rejected', value: `${item.last.by}${item.last.reason ? `: ${item.last.reason}` : ''}`, tone: item.last.action === 'approve' ? 'positive' : 'warning' });
          }

          const actions: ReactNode[] = [];
          if (canDecide && !isRejecting) {
            actions.push(
              <SemanticButton key="approve" action="photo-review:approve" type="button" size="xs" onClick={() => void approve([item.id])} disabled={isBusy}>
                {isBusy ? 'Approving…' : 'Approve'}
              </SemanticButton>
            );
            if (status === 'pending_review') {
              actions.push(
                <SemanticButton key="reject" action="photo-review:reject" type="button" size="xs" variant="secondary" onClick={() => { setRejecting(item.id); setReason(''); }} disabled={isBusy}>
                  Reject
                </SemanticButton>
              );
            }
          }
          if (isRejecting) {
            actions.push(
              <SemanticButton key="confirm" action="photo-review:confirm-reject" type="button" size="xs" variant="danger" onClick={() => void reject(item.id)} disabled={isBusy}>
                {isBusy ? 'Rejecting…' : 'Confirm reject'}
              </SemanticButton>,
              <SemanticButton key="cancel" action="photo-review:cancel-reject" type="button" size="xs" variant="secondary" onClick={() => setRejecting(null)} disabled={isBusy}>
                Cancel
              </SemanticButton>
            );
          }
          if (item.status === 'approved') {
            actions.push(
              <Link key="view" href={`/share/${item.id}`} style={{ textDecoration: 'none' }}>
                <SemanticButton action="photo-review:view-photo" size="xs" variant="secondary">View</SemanticButton>
              </Link>
            );
          }

          return (
            <ListingCard
              key={item.id}
              title={item.name}
              image={
                <div style={{ position: 'relative' }}>
                  {canDecide ? (
                    <input
                      type="checkbox"
                      checked={selectedSet.has(item.id)}
                      onChange={() => setSelected((current) => (current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]))}
                      disabled={isBusy}
                      aria-label={`Select the photo of ${item.name}`}
                      style={{ position: 'absolute', zIndex: 1, insetBlockStart: 8, insetInlineStart: 8 }}
                    />
                  ) : null}
                  {item.photoUrl ? (
                    <Image src={item.photoUrl} alt={`Photo of ${item.name}`} width={800} height={450} unoptimized style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }} />
                  ) : (
                    <div style={{ aspectRatio: '16 / 9', display: 'grid', placeItems: 'center', color: 'var(--gds-color-muted)', fontSize: '0.75rem' }}>No photo</div>
                  )}
                </div>
              }
              description={
                isRejecting ? (
                  <TextInput
                    label="Reason (optional, for the record)"
                    value={reason}
                    onChange={(event) => setReason(event.currentTarget.value)}
                    maxLength={500}
                    disabled={isBusy}
                    data-autofocus
                  />
                ) : undefined
              }
              metadata={metadata}
              actions={actions}
            />
          );
        })}
      </div>
    </div>
  );
}
