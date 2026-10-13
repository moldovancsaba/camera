/**
 * The photos of one event waiting for approval, inside the event's Vetting tab (camera#284, docs/PHOTO_VETTING_PLAN.md): the Waiting / Rejected / Approved lists where event managers and global admins
 * approve or reject, and under them the settings (vetting on or off, marking the people) and the counts of what was marked. **The Waiting list is the one-at-a-time review screen by default**
 * (issue 628, owner request 2026-10-12: components/admin/PhotoReviewStage.tsx, inline when the event has photo vetting on); `?view=list` shows the old list of cards instead, with a plain link each
 * way. The Rejected and Approved lists are lists of cards. The work comes first on the page: a reviewer at the match should not scroll past settings to reach the photo.
 * (The try-on results that used to be vetted below the photos went with the try-on integration, issue 557.)
 */

import Link from 'next/link';
import type { Db } from 'mongodb';
import { Stack, Text, Title } from '@/components/gds/PublicPrimitives';
import PhotoReviewQueue from '@/components/admin/PhotoReviewQueue';
import PhotoReviewStage from '@/components/admin/PhotoReviewStage';
import PhotoVettingSwitch from '@/components/admin/PhotoVettingSwitch';
import MarkPeopleSwitch from '@/components/admin/MarkPeopleSwitch';
import PeopleSummaryCard from '@/components/admin/PeopleSummaryCard';
import { COLLECTIONS } from '@/lib/db/schemas';
import { markPeopleOn, summarizePeople } from '@/lib/photo-vetting/people';
import { loadEventVocabulary } from '@/lib/photo-vetting/vocabulary-load';
import { photoVettingRequired } from '@/lib/events/photo-vetting';
import { countPhotoQueue, loadPhotoQueue, type QueueStatus } from '@/lib/photo-vetting/queue';

const TAB_LABEL: Record<QueueStatus, string> = { pending_review: 'Waiting', rejected: 'Rejected', approved: 'Approved' };

interface EventPhotoVettingProps {
  db: Db;
  /** The event's Mongo id, as used in /admin/events/<id>. */
  eventMongoId: string;
  event: { eventId?: unknown; name?: unknown; photoVetting?: { required?: unknown }; markPeopleInVetting?: unknown; partnerId?: unknown; annotationVocabulary?: unknown };
  status: QueueStatus;
  /** `list` shows the Waiting list as cards instead of the one-at-a-time screen. */
  view?: 'list';
  canChangeSetting: boolean;
}

export default async function EventPhotoVetting({ db, eventMongoId, event, status, view, canChangeSetting }: EventPhotoVettingProps) {
  const eventUuid = String(event.eventId ?? '');
  // The words of the event first: the photos of the queue are read with them (a custom option would otherwise make a marked photo read as unmarked).
  const vocabulary = await loadEventVocabulary(db, event);
  const [items, counts, marked] = await Promise.all([
    loadPhotoQueue(db, eventUuid, status, vocabulary),
    countPhotoQueue(db, eventUuid),
    // What the reviewers marked in this event's photos (issue 542): only the people, nothing else is read.
    db.collection(COLLECTIONS.SUBMISSIONS).find({ $or: [{ eventId: eventUuid }, { eventIds: { $in: [eventUuid] } }], people: { $exists: true }, isArchived: { $ne: true } }, { projection: { people: 1 } }).limit(5000).toArray(),
  ]);
  const required = photoVettingRequired(event);
  const any = counts.pending_review + counts.rejected + counts.approved > 0;
  const markPeople = markPeopleOn(event);
  // The Waiting list of an event with vetting on is the one-at-a-time screen unless the list of cards was asked for.
  const oneAtATime = required && status === 'pending_review' && view !== 'list';
  const listHref = `/admin/events/${eventMongoId}/vetting?photos=pending_review&view=list`;

  return (
    <Stack gap="lg" data-event-photo-vetting>
      <div>
        <Title order={2}>Photos</Title>
        <Text size="sm" c="dimmed">
          While photo vetting is on, the photos of {String(event.name ?? 'this event')} wait here for approval. Approving puts the frame on the photo, publishes it and emails the user the link.
        </Text>
      </div>

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
                  {TAB_LABEL[tab]} ({counts[tab]})
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
            <PhotoReviewStage eventId={eventMongoId} items={items} vocabulary={vocabulary} markPeople={markPeople} embedded />
          ) : (
            <PhotoReviewQueue key={status} status={status} initialItems={items} canReview eventId={eventMongoId} vocabulary={vocabulary} markPeopleEventId={required && markPeople ? eventMongoId : undefined} />
          )}
        </>
      ) : null}

      <PhotoVettingSwitch eventId={eventMongoId} required={required} canChange={canChangeSetting} />
      {required ? <MarkPeopleSwitch eventId={eventMongoId} on={markPeople} canChange={canChangeSetting} /> : null}
      <PeopleSummaryCard summary={summarizePeople(marked as Array<{ people?: unknown }>, vocabulary)} vocabulary={vocabulary} />
    </Stack>
  );
}
