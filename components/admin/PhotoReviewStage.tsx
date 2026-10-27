'use client';

/**
 * One-at-a-time photo vetting. This screen makes only the publication decision;
 * all image analytics and human corrections belong to the Fanmass result review.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { RejectReasonPicker } from '@/components/admin/ReviewChoices';
import { WAITING_REFRESH_MS, shouldRefreshWaiting } from '@/lib/photo-vetting/auto-refresh';
import type { PhotoQueueItem } from '@/lib/photo-vetting/queue';
import { photoPrecheckNotice } from '@/lib/photo-vetting/precheck-notice';
import { chosenReasons, toggleReason } from '@/lib/photo-vetting/rejection';
import type { ResolvedVocabulary } from '@/lib/photo-vetting/vocabulary';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { uiLanguageDirection } from '@/lib/i18n/locale-negotiation';
import { adminOperationText } from '@/lib/i18n/admin-operations';

interface Props {
  eventId: string;
  items: PhotoQueueItem[];
  vocabulary: ResolvedVocabulary;
  embedded?: boolean;
  backHref?: string;
  backLabel?: string;
}

interface DecisionNotice {
  text: string;
  warning: boolean;
}

const ANSWER_TIMEOUT_MS = 120_000;
async function decide(id: string, body: { action: 'approve' } | { action: 'reject'; reasons: string[]; reason?: string }) {
  let response: Response;
  try {
    response = await fetch(`/api/admin/submissions/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ANSWER_TIMEOUT_MS),
    });
  } catch {
    throw new Error('No answer arrived from the server. The photo may have been decided; reload to see the saved status.');
  }
  const result = (await response.json().catch(() => ({}))) as { error?: unknown; message?: unknown; data?: { email?: unknown; emailDeferred?: unknown } };
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : typeof result.message === 'string' ? result.message : `Server error ${response.status}`);
  return result.data ?? {};
}

function decisionMessage(action: 'approve' | 'reject', answer: { email?: unknown; emailDeferred?: unknown }): DecisionNotice {
  const outcome = answer.email === 'sent'
    ? 'The user was emailed.'
    : answer.emailDeferred === true
      ? 'The decision email will be sent when the user provides an address.'
      : answer.email === 'failed'
        ? 'The decision was saved, but the email failed.'
        : 'No email was sent.';
  return { text: `${action === 'approve' ? 'Photo approved.' : 'Photo rejected.'} ${outcome}`, warning: answer.email === 'failed' };
}

export default function PhotoReviewStage({ eventId, items, vocabulary, embedded = false, backHref, backLabel }: Props) {
  const router = useRouter();
  const language = useUiLanguage();
  const t = useCallback((source: string) => adminOperationText(source, language), [language]);
  const [decided, setDecided] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<DecisionNotice | null>(null);
  const [newPhotosCount, setNewPhotosCount] = useState(0);
  const previousPhotoIds = useRef<Set<string> | null>(null);
  const queue = useMemo(() => {
    const open = items.filter((item) => !decided.includes(item.id));
    return [...open.filter((item) => !skipped.includes(item.id)), ...skipped.flatMap((id) => open.filter((item) => item.id === id))];
  }, [items, decided, skipped]);
  const item = queue[0];

  useEffect(() => {
    const refresh = () => {
      if (shouldRefreshWaiting({ status: 'pending_review', hidden: document.visibilityState === 'hidden', deciding: busy, rejecting })) router.refresh();
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = setInterval(refresh, WAITING_REFRESH_MS);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [busy, rejecting, router]);

  useEffect(() => {
    const ids = new Set(items.map((photo) => photo.id));
    const previous = previousPhotoIds.current;
    if (previous) {
      const added = [...ids].filter((id) => !previous.has(id)).length;
      if (added > 0) setNewPhotosCount((count) => count + added);
    }
    previousPhotoIds.current = ids;
  }, [items]);

  const finishDecision = async (action: 'approve' | 'reject') => {
    if (!item || busy) return;
    const selectedReasons = chosenReasons(reasons, vocabulary);
    if (action === 'reject' && selectedReasons.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const answer = await decide(item.id, action === 'approve'
        ? { action }
        : { action, reasons: selectedReasons, ...(note.trim() ? { reason: note.trim() } : {}) });
      setDecided((current) => [...current, item.id]);
      setSkipped((current) => current.filter((id) => id !== item.id));
      setNotice(decisionMessage(action, answer));
      setRejecting(false);
      setReasons([]);
      setNote('');
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The decision could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  if (!item) {
    return (
      <div lang={language} dir={uiLanguageDirection(language)} style={{ display: 'grid', gap: '1rem' }} data-photo-review-empty>
        {notice ? <InlineAlert title={t('Last decision')} message={notice.text} severity={notice.warning ? 'warning' : 'success'} /> : null}
        {newPhotosCount > 0 ? <InlineAlert title="More photos are waiting" message={`${newPhotosCount} more ${newPhotosCount === 1 ? 'photo is' : 'photos are'} waiting for vetting.`} severity="success" /> : null}
        <StateBlock variant="empty" title={items.length === 0 ? t('Nothing is waiting') : t('All the photos are decided')} description={t('New consent-eligible photos appear here automatically. Image analysis and human corrections are handled on the Photo analysis page.')} />
        {embedded ? null : <Link href={backHref ?? `/admin/events/${eventId}/vetting`}>{backLabel ?? t('Back to the Vetting tab')}</Link>}
      </div>
    );
  }

  const moderationNotice = photoPrecheckNotice(item.precheck);

  return (
    <section lang={language} dir={uiLanguageDirection(language)} style={{ display: 'grid', gap: '1rem', maxWidth: 1500 }} data-photo-review-stage>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.5rem' }}>
        <strong data-review-position>{t('Photo')} {decided.length + 1} {t('of')} {decided.length + queue.length} {t('waiting')}</strong>
        <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem', overflowWrap: 'anywhere' }}>{item.identityLabel}</span>
      </div>
      <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.875rem', margin: 0 }} data-review-help>{t('Review this photo and approve or reject it. A rejection needs at least one reason.')} {t('AI precheck is advisory; all decisions remain with the reviewer.')}</p>
      {notice ? <InlineAlert title={t('Last decision')} message={notice.text} severity={notice.warning ? 'warning' : 'success'} /> : null}
      {error ? <InlineAlert title={t('That did not work')} message={error} severity="error" /> : null}
      {newPhotosCount > 0 ? <InlineAlert title="More photos are waiting" message={`${newPhotosCount} new photos will follow this one.`} severity="success" /> : null}
      {moderationNotice ? <InlineAlert title={moderationNotice.title} message={moderationNotice.message} severity={moderationNotice.severity} /> : null}
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(0, 2fr) minmax(18rem, 1fr)', alignItems: 'start' }}>
        <div style={{ background: 'var(--mantine-color-gray-1)', lineHeight: 0, position: 'relative', width: '100%' }}>
          {item.photoUrl ? <Image src={item.photoUrl} alt={`${t('Photo')} ${decided.length + 1}`} width={1600} height={1200} unoptimized priority draggable={false} style={{ display: 'block', height: 'auto', maxHeight: 'calc(100vh - 14rem)', maxWidth: '100%', objectFit: 'contain', width: '100%' }} /> : <div style={{ display: 'grid', minHeight: 320, placeItems: 'center' }}>{t('No photo available')}</div>}
        </div>
        <aside style={{ display: 'grid', gap: '0.75rem', border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', padding: '1rem' }}>
          <strong>{item.name}</strong>
          {item.email ? <span>{item.email}</span> : <span style={{ color: 'var(--mantine-color-dimmed)' }}>{item.identityLabel}</span>}
          {rejecting ? (
            <div style={{ display: 'grid', gap: '0.75rem' }} data-reject-block>
              <RejectReasonPicker vocabulary={vocabulary} reasons={reasons} onToggleReason={(key) => setReasons((current) => toggleReason(current, key))} note={note} onNote={setNote} disabled={busy} />
              <SemanticButton action="photo-review:confirm-reject" type="button" variant="danger" disabled={busy || chosenReasons(reasons, vocabulary).length === 0} loading={busy} onClick={() => void finishDecision('reject')}>{t('Reject photo')}</SemanticButton>
              <SemanticButton action="photo-review:cancel-reject" type="button" variant="secondary" disabled={busy} onClick={() => setRejecting(false)}>{t('Cancel')}</SemanticButton>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <SemanticButton action="photo-review:approve" type="button" disabled={busy} loading={busy} onClick={() => void finishDecision('approve')}>{t('Approve')}</SemanticButton>
              <SemanticButton action="photo-review:reject" type="button" variant="secondary" disabled={busy} onClick={() => { setRejecting(true); setReasons([]); setNote(''); }}>{t('Reject…')}</SemanticButton>
              <SemanticButton action="photo-review:skip" type="button" variant="outline" disabled={busy || queue.length < 2} onClick={() => { setNotice(null); setSkipped((current) => [...current.filter((id) => id !== item.id), item.id]); }}>{t('Skip for now')}</SemanticButton>
            </div>
          )}
          {item.status === 'rejected' && item.rejectReasons.length > 0 ? <p style={{ color: 'var(--mantine-color-orange-text)', margin: 0 }}>Previous rejection: {item.rejectReasons.join(', ')}</p> : null}
        </aside>
      </div>
    </section>
  );
}
