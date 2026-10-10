import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import EventPhotoVetting from '@/components/admin/EventPhotoVetting';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getPartnerScopedAccessForEvent, isGlobalAdminSession } from '@/lib/partners/authorization';
import { isQueueStatus, type QueueStatus } from '@/lib/photo-vetting/queue';

export const dynamic = 'force-dynamic';

interface VettingQuery {
  /** Picks the photo list: waiting (the default), rejected or approved. */
  photos?: string;
}

// WHAT: The event workspace's Vetting tab: the photos of the event that wait for approval (photo vetting, camera#284), for the event's
// managers and global admins. `photos` picks the list (waiting, rejected, approved).
// WHY: vetting is one place per event. The try-on results that used to be vetted below the photos are gone with the try-on integration
// (issue 557, docs/TRYON_REMOVED.md); any other query a bookmarked try-on link carried (?archive=, ?queue=, ?failed=) is ignored.
export default async function EventVettingTab({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<VettingQuery>;
}) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const { photos }: VettingQuery = searchParams ? await searchParams : {};
  const photoStatus: QueueStatus = isQueueStatus(photos) ? photos : 'pending_review';

  const session = await getSession();
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, id, session!, 'manager');
  if (!access.allowed) redirect(`/admin/events/${id}`);
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) notFound();

  const globalAdmin = isGlobalAdminSession(session);

  return (
    <div style={{ display: 'grid', gap: '2.5rem' }}>
      <EventPhotoVetting db={db} eventMongoId={id} event={event as { eventId?: unknown; name?: unknown; photoVetting?: { required?: unknown }; markPeopleInVetting?: unknown }} status={photoStatus} canChangeSetting={globalAdmin} />
    </div>
  );
}
