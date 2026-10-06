import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import AdminTryOnResultsPage from '@/app/admin/tryon/vetting/page';
import EventPhotoVetting from '@/components/admin/EventPhotoVetting';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getPartnerScopedAccessForEvent, isGlobalAdminSession } from '@/lib/partners/authorization';
import { isQueueStatus, type QueueStatus } from '@/lib/photo-vetting/queue';

export const dynamic = 'force-dynamic';

interface VettingQuery {
  reviewStatus?: string;
  search?: string;
  archive?: string;
  failed?: string;
  queue?: string;
  photos?: string;
}

// WHAT: The event workspace's Vetting tab. WHY: vetting is one place. The photos of the event that wait for approval (photo vetting,
// camera#284) come first, for the event's managers and global admins; below them, for global admins, the try-on result vetting: it
// reuses the exact same global vetting page/component, just supplying the event id from the route instead of a ?eventId= query
// param -- the underlying scoping, count tiles, and chip already resolve either the UUID or the Mongo _id (Phase 0), so this needs no
// logic of its own. Forwards the real query string (e.g. ?archive=greatest, ?queue=1) so links to a specific bucket work through
// this route too, not just through /admin/tryon/vetting directly. `photos` picks the photo list (waiting, rejected, approved).
export default async function EventVettingTab({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<VettingQuery>;
}) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const { photos, ...tryOnParams }: VettingQuery = searchParams ? await searchParams : {};
  const photoStatus: QueueStatus = isQueueStatus(photos) ? photos : 'pending_review';

  const session = await getSession();
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, id, session!, 'manager');
  if (!access.allowed) redirect(`/admin/events/${id}`);
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) notFound();

  const globalAdmin = isGlobalAdminSession(session);
  // The try-on views (?archive=, ?queue=, ?failed=, ?reviewStatus=) are the try-on part of this tab: no photo section on top of them.
  const tryOnView = Boolean(tryOnParams.archive || tryOnParams.queue || tryOnParams.failed || tryOnParams.reviewStatus || tryOnParams.search);

  return (
    <div style={{ display: 'grid', gap: '2.5rem' }}>
      {tryOnView && globalAdmin ? null : <EventPhotoVetting db={db} eventMongoId={id} event={event as { eventId?: unknown; name?: unknown; photoVetting?: { required?: unknown } }} status={photoStatus} canChangeSetting={globalAdmin} />}
      {globalAdmin ? <AdminTryOnResultsPage searchParams={Promise.resolve({ ...tryOnParams, eventId: id })} /> : null}
    </div>
  );
}
