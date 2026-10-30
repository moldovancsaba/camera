/**
 * The photos of one event waiting for approval, inside the event's Vetting tab (camera#284, docs/PHOTO_VETTING_PLAN.md): the Waiting / Rejected / Approved lists where event managers and global admins
 * approve or reject. Image analytics are handled together by Fanmass and human review on the Photo analysis page. **The Waiting list is the one-at-a-time review screen by default**
 * (issue 628, owner request 2026-10-12: components/admin/PhotoReviewStage.tsx, inline when the event has photo vetting on); `?view=list` shows the old list of cards instead, with a plain link each
 * way. The Rejected and Approved lists are lists of cards. The work comes first on the page: a reviewer at the match should not scroll past settings to reach the photo.
 * (The try-on results that used to be vetted below the photos went with the try-on integration, issue 557.)
 */

import Link from 'next/link';
import type { Db } from 'mongodb';
import { Card, Stack, Text, Title } from '@/components/gds/PublicPrimitives';
import PhotoReviewQueue from '@/components/admin/PhotoReviewQueue';
import PhotoReviewStage from '@/components/admin/PhotoReviewStage';
import PhotoVettingSwitch from '@/components/admin/PhotoVettingSwitch';
import { loadEventVocabulary } from '@/lib/photo-vetting/vocabulary-load';
import { photoVettingRequired } from '@/lib/events/photo-vetting';
import { photoModerationPrecheckEnabled } from '@/lib/events/photo-moderation';
import { moderationConfiguration } from '@/lib/photo-moderation/config';
import { countPhotoQueue, loadPhotoQueue, type QueueStatus } from '@/lib/photo-vetting/queue';
import type { UiLanguage } from '@/lib/i18n';
import { uiLanguageDirection } from '@/lib/i18n/locale-negotiation';
import { adminOperationText } from '@/lib/i18n/admin-operations';

const TAB_LABEL: Record<QueueStatus, string> = { pending_review: 'Waiting', rejected: 'Rejected', approved: 'Approved' };

interface EventPhotoVettingProps {
  db: Db;
  /** The event's Mongo id, as used in /admin/events/<id>. */
  eventMongoId: string;
  event: { eventId?: unknown; name?: unknown; photoVetting?: { required?: unknown }; photoModerationPrecheck?: { enabled?: unknown }; partnerId?: unknown; annotationVocabulary?: unknown };
  status: QueueStatus;
  /** One-based page for the card queue. */
  page: number;
  /** `list` shows the Waiting list as cards instead of the one-at-a-time screen. */
  view?: 'list';
  canChangeSetting: boolean;
  language: UiLanguage;
}

export default async function EventPhotoVetting({ db, eventMongoId, event, status, page, view, canChangeSetting, language }: EventPhotoVettingProps) {
  const t = (source: string) => adminOperationText(source, language);
  const eventUuid = String(event.eventId ?? '');
  // The words of the event first: the photos of the queue are read with them (a custom option would otherwise make a marked photo read as unmarked).
  const vocabulary = await loadEventVocabulary(db, event);
  const counts = await countPhotoQueue(db, eventUuid, eventMongoId);
  const activePage = Math.min(page, Math.max(1, Math.ceil(counts[status] / 60)));
  const items = await loadPhotoQueue(db, eventUuid, status, 60, (activePage - 1) * 60, { eventMongoId });
  const required = photoVettingRequired(event);
  const moderationEnabled = photoModerationPrecheckEnabled(event);
  const moderationConfigured = moderationConfiguration() !== null;
  const any = counts.pending_review + counts.rejected + counts.approved > 0;
  // The Waiting list of an event with vetting on is the one-at-a-time screen unless the list of cards was asked for.
  const oneAtATime = required && status === 'pending_review' && view !== 'list';
  const listHref = `/admin/events/${eventMongoId}/vetting?photos=pending_review&view=list`;

  return (
    <Stack gap="lg" lang={language} dir={uiLanguageDirection(language)} data-event-photo-vetting>
      <div>
          <Title order={2}>{t('Photos')}</Title>
        <Text size="sm" c="dimmed">
          While photo vetting is on, the photos of {String(event.name ?? 'this event')} wait here for approval. Approving puts the frame on the photo, publishes it and emails the user the link.
        </Text>
      </div>

        <Link href={`/admin/events/${eventMongoId}/analysis`} style={{ alignSelf: 'start', fontSize: '0.875rem' }} data-photo-analysis-link>
        {t('Open Fanmass photo analysis')}
      </Link>

      {counts.consentPending > 0 || counts.consentUnknown > 0 ? (
        <Card aria-label="Photos on consent hold">
          <Stack gap="xs">
            <Text fw={700}>Photos excluded by consent checks ({counts.consentPending + counts.consentUnknown})</Text>
            {counts.consentPending > 0 ? <Text size="sm">Awaiting required consent: {counts.consentPending}</Text> : null}
            {counts.consentUnknown > 0 ? <Text size="sm">Consent status missing; held from review: {counts.consentUnknown}</Text> : null}
            <Text size="sm" c="dimmed">These photos stay private and are excluded from vetting and analysis. Photos with an expired 24-hour consent window are removed by Camera’s scheduled cleanup. A missing consent record must be verified before the photo can be reviewed.</Text>
          </Stack>
        </Card>
      ) : null}

      {required || any ? (
        <>
          <nav aria-label="Photo status" style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {(Object.keys(TAB_LABEL) as QueueStatus[]).map((tab) => {
              const active = tab === status;
              return (
                <Link
                  key={tab}
                  href={`/admin/events/${eventMongoId}/vetting?photos=${tab}`}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    borderRadius: 8,
                    padding: '0.4rem 0.75rem',
                    fontSize: '0.875rem',
                    fontWeight: active ? 700 : 500,
                    textDecoration: 'none',
                    background: active ? 'var(--mantine-color-blue-0)' : 'transparent',
                    color: active ? 'var(--mantine-color-blue-7)' : 'var(--mantine-color-dimmed)',
                  }}
                >
                  {t(TAB_LABEL[tab])} ({counts[tab]})
                </Link>
              );
            })}
            {required && status === 'pending_review' ? (
              <Link href={oneAtATime ? listHref : `/admin/events/${eventMongoId}/vetting?photos=pending_review`} style={{ fontSize: '0.875rem', marginInlineStart: 'auto' }} data-view-link>
                {oneAtATime ? 'Show the list' : 'Back to one at a time'}
              </Link>
            ) : null}
          </nav>
          {oneAtATime ? (
            <PhotoReviewStage eventId={eventMongoId} items={items} vocabulary={vocabulary} embedded />
          ) : (
            <PhotoReviewQueue key={`${status}-${activePage}`} status={status} initialItems={items} canReview vocabulary={vocabulary} page={activePage} pageSize={60} total={counts[status]} eventUrl={`/admin/events/${eventMongoId}/vetting`} listView={view === 'list'} />
          )}
        </>
      ) : null}

          <PhotoVettingSwitch eventId={eventMongoId} required={required} moderationEnabled={moderationEnabled} moderationConfigured={moderationConfigured} canChange={canChangeSetting} />
    </Stack>
  );
}
