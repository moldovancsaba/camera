'use client';

/**
 * The photo moderation queue of one event as a list of cards (camera#268, docs/PHOTO_VETTING_PLAN.md): the Rejected and Approved lists, and the Waiting list when "Show the list" is chosen (the Waiting
 * list opens the one-at-a-time screen by default, issue 628, components/admin/PhotoReviewStage.tsx). Approve and reject, one by one or selected in bulk. A rejection needs one or more reasons from the
 * event's vocabulary (the same picker as the one-at-a-time screen), and a rejected card says why in words. Each decision calls POST /api/admin/submissions/<id>/review; a photo leaves the list when
 * it is decided. Every control is a native button or checkbox, so the queue works from the keyboard. A decision locks only its own photo, so the
 * next photo can be decided while one is still being made, and the page is reloaded from the server after every decision, so the counts of the
 * tabs and the list always show what the server holds, also when an answer never arrives.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { InlineAlert, ListingCard, StateBlock, type ListingMetadataRow } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { RejectReasonPicker } from '@/components/admin/ReviewChoices';
import { WAITING_REFRESH_MS, shouldRefreshWaiting } from '@/lib/photo-vetting/auto-refresh';
import type { PhotoQueueItem, QueueStatus } from '@/lib/photo-vetting/queue';
import { chosenReasons, toggleReason } from '@/lib/photo-vetting/rejection';
import { optionLabel, type ResolvedVocabulary } from '@/lib/photo-vetting/vocabulary';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { uiLanguageDirection } from '@/lib/i18n/locale-negotiation';
import { adminOperationText } from '@/lib/i18n/admin-operations';

interface PhotoReviewQueueProps {
  status: QueueStatus;
  initialItems: PhotoQueueItem[];
  canReview: boolean;
  /** The words of the event: the reasons of a rejection, and what a rejected card says. */
  vocabulary: ResolvedVocabulary;
  page: number;
  pageSize: number;
  total: number;
  eventUrl: string;
  listView?: boolean;
}

interface Notice {
  severity: 'success' | 'error' | 'warning';
  title: string;
  message: string;
}

interface ReviewAnswer {
  email?: 'sent' | 'skipped' | 'failed';
  emailDeferred?: boolean;
}

const BULK_CONCURRENCY = 2;
const FRAME_LABEL = { generated: 'Generated frame', own: 'Own frame', none: 'No frame' } as const;

function formatDateTime(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(language, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** No answer within this time: the decision may still have been made, so the list is reloaded instead of guessed. */
const REVIEW_ANSWER_TIMEOUT_MS = 120_000;

class NoAnswerError extends Error {
  constructor() {
    super('No answer arrived from the server. The photo may have been decided anyway; the list shows what the server holds now.');
  }
}

async function review(id: string, action: 'approve' | 'reject' | 'return_to_vetting' | 'retry_approval_email', rejection?: { reasons: string[]; note?: string }): Promise<ReviewAnswer> {
  let response: Response;
  try {
    response = await fetch(`/api/admin/submissions/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...(rejection ? { reasons: rejection.reasons, ...(rejection.note ? { reason: rejection.note } : {}) } : {}) }),
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
  const deferred = answers.filter((answer) => answer.emailDeferred === true).length;
  const skipped = answers.filter((answer) => answer.email === 'skipped' && answer.emailDeferred !== true).length;
  const parts = [
    failed ? `${failed} email${failed === 1 ? '' : 's'} could not be sent` : '',
    deferred ? `${deferred} will receive the email when they sign in or provide an email address` : '',
    skipped ? `${skipped} email${skipped === 1 ? '' : 's'} were skipped (no recipient or event email setting)` : '',
  ].filter(Boolean);
  return parts.length ? parts.join('; ') : '';
};

export default function PhotoReviewQueue({ status, initialItems, canReview, vocabulary, page, pageSize, total, eventUrl, listView }: PhotoReviewQueueProps) {
  const router = useRouter();
  const language = useUiLanguage();
  const t = useCallback((source: string) => adminOperationText(source, language), [language]);
  // Photos decided here leave the list at once; everything else comes from the server (initialItems is fresh after each router.refresh()).
  const [decided, setDecided] = useState<string[]>([]);
  const items = useMemo(() => initialItems.filter((item) => !decided.includes(item.id)), [initialItems, decided]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string[]>([]);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [rejectNote, setRejectNote] = useState('');
  const [progress, setProgress] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [newPhotosCount, setNewPhotosCount] = useState(0);
  const previousPhotoIds = useRef<Set<string> | null>(null);

  // The Waiting list asks the server for new photos by itself (camera#373), including when an approver returns to this tab after it was in the background.
  useEffect(() => {
    const refreshIfReady = () => {
      if (shouldRefreshWaiting({ status, hidden: document.visibilityState === 'hidden', deciding: busy.length > 0, rejecting: rejecting !== null })) router.refresh();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshIfReady();
    };
    const onPageShow = () => refreshIfReady();
    const timer = setInterval(refreshIfReady, WAITING_REFRESH_MS);
    window.addEventListener('focus', refreshIfReady);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refreshIfReady);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [status, busy.length, rejecting, router]);

  // A refresh should be visible to the reviewer, especially when the one-at-a-time screen has an active photo open.
  useEffect(() => {
    const ids = new Set(initialItems.map((item) => item.id));
    const previous = previousPhotoIds.current;
    if (status === 'pending_review' && previous) {
      const added = [...ids].filter((id) => !previous.has(id)).length;
      if (added > 0) setNewPhotosCount((count) => count + added);
    }
    previousPhotoIds.current = ids;
  }, [initialItems, status]);

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
      setNotice({ severity: answers.some((answer) => answer.email === 'failed') ? 'warning' : 'success', title: done.length === 1 ? 'Photo approved' : `${done.length} photos approved`, message: note ? note : 'The user gets the link by email.' });
    }
  };

  const reject = async (id: string) => {
    setNotice(null);
    markBusy([id]);
    try {
      const answer = await review(id, 'reject', { reasons: chosenReasons(reasons, vocabulary), note: rejectNote.trim() || undefined });
      removeFromList([id]);
      setRejecting(null);
      setReasons([]);
      setRejectNote('');
      const note = emailNote([answer]);
      setNotice({ severity: answer.email === 'failed' ? 'warning' : 'success', title: 'Photo rejected', message: `${note || 'The user gets a short note.'} The photo stays private.` });
    } catch (error) {
      setNotice({ severity: 'error', title: 'Not rejected', message: error instanceof Error ? error.message : 'The photo could not be rejected' });
    } finally {
      markFree([id]);
      router.refresh();
    }
  };

  const returnToVetting = async (id: string) => {
    setNotice(null);
    markBusy([id]);
    try {
      const answer = await review(id, 'return_to_vetting');
      removeFromList([id]);
      setNotice({ severity: answer.email === 'failed' ? 'warning' : 'success', title: 'Back in vetting', message: answer.email === 'sent' ? 'The photo is hidden while it is reviewed. The guest has been emailed.' : answer.email === 'failed' ? 'The photo is hidden while it is reviewed, but the guest email could not be sent.' : 'The photo is hidden while it is reviewed. No email was sent.' });
    } catch (error) {
      setNotice({ severity: 'error', title: 'Could not return photo', message: error instanceof Error ? error.message : 'The photo could not be returned to vetting' });
    } finally {
      markFree([id]);
      router.refresh();
    }
  };

  const retryApprovalEmail = async (id: string) => {
    setNotice(null);
    markBusy([id]);
    try {
      const answer = await review(id, 'retry_approval_email');
      setNotice({
        severity: answer.email === 'sent' ? 'success' : 'warning',
        title: answer.email === 'sent' ? 'Approval email sent' : 'Approval email not sent',
        message: answer.email === 'sent'
          ? 'The guest has been sent the link to the approved photo.'
          : answer.email === 'failed'
            ? 'The email provider could not send the link. You can try again.'
            : 'No email was sent. Check that the guest has an email address and approval emails are enabled for this event.',
      });
    } catch (error) {
      setNotice({ severity: 'error', title: 'Approval email retry failed', message: error instanceof Error ? error.message : 'The email could not be retried.' });
    } finally {
      markFree([id]);
      router.refresh();
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pagination = (
    <nav lang={language} dir={uiLanguageDirection(language)} aria-label={t('Photo pages')} style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
      {page > 1 ? <Link href={`${eventUrl}?photos=${status}${status === 'pending_review' && listView ? '&view=list' : ''}&page=${page - 1}`}>{t('Previous photos')}</Link> : null}
      <span aria-live="polite" style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' }}>{t('Page')} {page} {t('of')} {pageCount} · {t('showing')} {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} {t('of')} {total}</span>
      {page < pageCount ? <Link href={`${eventUrl}?photos=${status}${status === 'pending_review' && listView ? '&view=list' : ''}&page=${page + 1}`}>{t('Next photos')}</Link> : null}
    </nav>
  );

  if (items.length === 0) {
    return (
      <div lang={language} dir={uiLanguageDirection(language)} style={{ display: 'grid', gap: '1rem' }}>
        {notice ? <InlineAlert title={notice.title} message={notice.message} severity={notice.severity} /> : null}
        {page > 1 ? pagination : null}
        <StateBlock
          variant="empty"
          title={status === 'pending_review' ? t('Nothing is waiting') : status === 'rejected' ? t('No rejected photos') : t('No approved photos yet')}
          description={status === 'pending_review' ? 'New photos of this event appear here until they are approved or rejected. This page looks for new photos by itself every 10 seconds.' : 'Photos appear here once they have been decided.'}
        />
      </div>
    );
  }

  return (
    <div lang={language} dir={uiLanguageDirection(language)} style={{ display: 'grid', gap: '1rem' }} data-photo-review-queue>
      {canDecide ? (
        <section style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <SemanticButton action="photo-review:toggle-select-all" type="button" variant="secondary" onClick={() => setSelected(allSelected ? [] : allIds)} disabled={working}>
              {allSelected ? t('Clear selection') : t('Select all')}
            </SemanticButton>
            {selected.length > 0 ? (
              <SemanticButton action="photo-review:approve-selected" type="button" onClick={() => void approve(selected)} disabled={working}>
                {working ? (progress ?? t('Approving…')) : t('Approve selected')}
              </SemanticButton>
            ) : null}
          </div>
          <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.75rem' }}>
            {selected.length > 0 ? `${selected.length} selected. ` : ''}
            {status === 'pending_review' ? 'Oldest first. Looks for new photos every 10 seconds. ' : ''}
            {items.length} shown
          </span>
        </section>
      ) : null}

      {notice ? <InlineAlert title={notice.title} message={notice.message} severity={notice.severity} /> : null}
      {newPhotosCount > 0 && status === 'pending_review' ? <InlineAlert title="More photos are waiting" message={`${newPhotosCount} more ${newPhotosCount === 1 ? 'photo is' : 'photos are'} waiting for vetting.`} severity="success" /> : null}
      {pagination}

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))' }}>
        {items.map((item) => {
          const isBusy = busy.includes(item.id);
          const isRejecting = rejecting === item.id;
          const metadata: ListingMetadataRow[] = [
            { id: 'when', label: t('Taken'), value: formatDateTime(item.createdAt, language), tone: 'muted' },
            { id: 'frame', label: t('Frame'), value: t(FRAME_LABEL[item.frameKind]), tone: 'muted' },
          ];
          metadata.unshift({ id: item.email ? 'email' : 'identity', label: item.email ? t('Email') : t('Identity'), value: item.identityLabel });
          // The buttons show their fixed labels, so the card itself says that a decision is being made (it can take a few seconds).
          if (isBusy) metadata.push({ id: 'working', label: t('Now'), value: isRejecting ? t('Rejecting…') : t('Approving… please wait'), tone: 'warning' });
          if (item.status !== 'approved') metadata.push({ id: 'wall', label: t('Wall'), value: item.shareOptIn ? t('shown') : t('private'), tone: 'muted' });
          if (item.status === 'rejected' && item.rejectReasons.length > 0) {
            metadata.push({ id: 'why', label: 'Why', value: item.rejectReasons.map((key) => optionLabel(vocabulary, 'reject_reason', key)).join(', '), tone: 'warning' });
          }
          if (item.last) {
            metadata.push({ id: 'last', label: item.last.action === 'approve' ? t('Approved') : item.last.action === 'reject' ? t('Rejected') : t('Returned to vetting'), value: item.last.by, tone: item.last.action === 'approve' ? 'positive' : 'warning' });
            // The note is a row of its own: a long note beside the name squeezed the label of the row to nothing.
            if (item.last.reason) metadata.push({ id: 'note', label: t('Note'), value: item.last.reason, tone: 'muted' });
          }

          const actions: ReactNode[] = [];
          if (canDecide && !isRejecting) {
            actions.push(
              <SemanticButton key="approve" action="photo-review:approve" type="button" size="xs" onClick={() => void approve([item.id])} disabled={isBusy}>
                {isBusy ? t('Approving…') : t('Approve')}
              </SemanticButton>
            );
            if (status === 'pending_review') {
              actions.push(
                <SemanticButton key="reject" action="photo-review:reject" type="button" size="xs" variant="secondary" onClick={() => { setRejecting(item.id); setReasons([]); setRejectNote(''); }} disabled={isBusy}>
                  {t('Reject')}
                </SemanticButton>
              );
            }
          }
          if (isRejecting) {
            actions.push(
              <SemanticButton key="confirm" action="photo-review:confirm-reject" type="button" size="xs" variant="danger" onClick={() => void reject(item.id)} disabled={isBusy || chosenReasons(reasons, vocabulary).length === 0}>
                {isBusy ? t('Rejecting…') : t('Confirm reject')}
              </SemanticButton>,
              <SemanticButton key="cancel" action="photo-review:cancel-reject" type="button" size="xs" variant="secondary" onClick={() => setRejecting(null)} disabled={isBusy}>
                {t('Cancel')}
              </SemanticButton>
            );
          }
          if (item.status === 'approved') {
            if (canReview && item.email && !item.approvalEmailSent) {
              actions.push(
                <SemanticButton key="retry-approval-email" action="photo-review:retry-approval-email" type="button" size="xs" variant="secondary" onClick={() => void retryApprovalEmail(item.id)} disabled={isBusy}>
                  {isBusy ? t('Sending…') : t('Send approval link')}
                </SemanticButton>
              );
            }
            actions.push(
              <Link key="view" href={`/share/${item.id}`} style={{ textDecoration: 'none' }}>
                <SemanticButton action="photo-review:view-photo" size="xs" variant="secondary">{t('View')}</SemanticButton>
              </Link>
            );
          }
          if (canReview && (item.status === 'approved' || item.status === 'rejected')) {
            actions.push(
              <SemanticButton key="return-to-vetting" action="photo-review:return-to-vetting" type="button" size="xs" variant="secondary" onClick={() => void returnToVetting(item.id)} disabled={isBusy}>
                {isBusy ? t('Returning…') : t('Back to vetting')}
              </SemanticButton>
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
                      aria-label={`${t('Select the photo of')} ${item.name}`}
                      style={{ position: 'absolute', zIndex: 1, insetBlockStart: 8, insetInlineStart: 8 }}
                    />
                  ) : null}
                  {item.photoUrl ? (
                    <Image src={item.photoUrl} alt={`${t('Photo of')} ${item.name}`} width={800} height={450} unoptimized style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }} />
                  ) : (
                    <div style={{ aspectRatio: '16 / 9', display: 'grid', placeItems: 'center', color: 'var(--mantine-color-dimmed)', fontSize: '0.75rem' }}>{t('No photo available')}</div>
                  )}
                </div>
              }
              description={
                isRejecting ? (
                  <RejectReasonPicker vocabulary={vocabulary} reasons={reasons} onToggleReason={(key) => setReasons((current) => toggleReason(current, key))} note={rejectNote} onNote={setRejectNote} disabled={isBusy} />
                ) : undefined
              }
              metadata={metadata}
              actions={actions}
            />
          );
        })}
      </div>
      {pagination}
    </div>
  );
}
