/**
 * The photos of one event waiting for approval, inside the event's Vetting tab (camera#284, docs/PHOTO_VETTING_PLAN.md): the setting that
 * makes new photos wait, the Waiting / Rejected / Approved lists and the queue where event managers and global admins approve or reject.
 * Vetting is one place: the try-on results of the same event are vetted below it.
 */

import Link from 'next/link';
import type { Db } from 'mongodb';
import { Stack, Text, Title } from '@/components/gds/PublicPrimitives';
import PhotoReviewQueue from '@/components/admin/PhotoReviewQueue';
import PhotoVettingSwitch from '@/components/admin/PhotoVettingSwitch';
import MarkPeopleSwitch from '@/components/admin/MarkPeopleSwitch';
import PeopleSummaryCard from '@/components/admin/PeopleSummaryCard';
import { COLLECTIONS } from '@/lib/db/schemas';
import { summarizePeople } from '@/lib/photo-vetting/people';
import { photoVettingRequired } from '@/lib/events/photo-vetting';
import { countPhotoQueue, loadPhotoQueue, type QueueStatus } from '@/lib/photo-vetting/queue';

const TAB_LABEL: Record<QueueStatus, string> = { pending_review: 'Waiting', rejected: 'Rejected', approved: 'Approved' };

interface EventPhotoVettingProps {
  db: Db;
  /** The event's Mongo id, as used in /admin/events/<id>. */
  eventMongoId: string;
  event: { eventId?: unknown; name?: unknown; photoVetting?: { required?: unknown }; markPeopleInVetting?: unknown };
  status: QueueStatus;
  canChangeSetting: boolean;
}

export default async function EventPhotoVetting({ db, eventMongoId, event, status, canChangeSetting }: EventPhotoVettingProps) {
  const eventUuid = String(event.eventId ?? '');
  const [items, counts, marked] = await Promise.all([
    loadPhotoQueue(db, eventUuid, status),
    countPhotoQueue(db, eventUuid),
    // What the reviewers marked in this event's photos (issue 542): only the people, nothing else is read.
    db.collection(COLLECTIONS.SUBMISSIONS).find({ $or: [{ eventId: eventUuid }, { eventIds: { $in: [eventUuid] } }], people: { $exists: true }, isArchived: { $ne: true } }, { projection: { people: 1 } }).limit(5000).toArray(),
  ]);
  const required = photoVettingRequired(event);
  const any = counts.pending_review + counts.rejected + counts.approved > 0;

  return (
    <Stack gap="lg" data-event-photo-vetting>
      <div>
        <Title order={2}>Photos</Title>
        <Text size="sm" c="dimmed">
          While photo vetting is on, the photos of {String(event.name ?? 'this event')} wait here for approval. Approving puts the frame on the photo, publishes it and emails the guest the link.
        </Text>
      </div>

      <PhotoVettingSwitch eventId={eventMongoId} required={required} canChange={canChangeSetting} />
      {required ? <MarkPeopleSwitch eventId={eventMongoId} on={event.markPeopleInVetting === true} canChange={canChangeSetting} waiting={counts.pending_review} /> : null}
      <PeopleSummaryCard summary={summarizePeople(marked as Array<{ people?: unknown }>)} />

      {required || any ? (
        <>
          <nav aria-label="Photo status" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
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
          </nav>
          <PhotoReviewQueue key={status} status={status} initialItems={items} canReview />
        </>
      ) : null}
    </Stack>
  );
}
