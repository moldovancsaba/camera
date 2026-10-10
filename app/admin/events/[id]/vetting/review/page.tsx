import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ObjectId } from 'mongodb';
import PhotoReviewStage from '@/components/admin/PhotoReviewStage';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { markPeopleOn } from '@/lib/photo-vetting/people';
import { loadPhotoQueue } from '@/lib/photo-vetting/queue';

export const dynamic = 'force-dynamic';

// WHAT: The big vetting view of an event (issue 542, docs/PHOTO_VETTING_PLAN.md): the photos that wait for approval, oldest first, one at a time, large. With "mark the people" on for the
// event, the reviewer first marks the people in each photo (a rectangle and the 16 buttons), then approves or rejects it. Without it, it is the big photo and the decision. The queue
// grid of the Vetting tab stays as it was; this is the way into the same decisions, so an event that does not use it changes nothing.
export default async function EventVettingReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ photo?: string }> }) {
  const { id } = await params;
  const { photo } = await searchParams;
  if (!ObjectId.isValid(id)) notFound();
  const session = await getSession();
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, id, session!, 'manager');
  if (!access.allowed) redirect(`/admin/events/${id}`);
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) notFound();

  const queue = await loadPhotoQueue(db, String(event.eventId ?? ''), 'pending_review', 50);
  // Review on a card of the Vetting tab opens the photo that was pressed first (issue 542, owner answer 267); the others follow, oldest first. A photo that is not waiting any more (decided meanwhile) is simply not found.
  const chosen = typeof photo === 'string' ? queue.find((item) => item.id === photo) : undefined;
  const items = chosen ? [chosen, ...queue.filter((item) => item !== chosen)] : queue;
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <nav aria-label="Breadcrumb">
        <Link href={`/admin/events/${id}/vetting`}>Vetting</Link>
        <span aria-hidden> / </span>
        <span>Review one by one</span>
      </nav>
      <PhotoReviewStage eventId={id} items={items} markPeople={markPeopleOn(event as { markPeopleInVetting?: unknown })} />
    </div>
  );
}
