import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ObjectId } from 'mongodb';
import PhotoReviewStage from '@/components/admin/PhotoReviewStage';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { markPeopleOn } from '@/lib/photo-vetting/people';
import { loadPhotoQueue, toPhotoQueueItem } from '@/lib/photo-vetting/queue';
import { loadEventVocabulary } from '@/lib/photo-vetting/vocabulary-load';

export const dynamic = 'force-dynamic';

// WHAT: The one-at-a-time review screen of an event as a page of its own (issue 542, issue 628, docs/PHOTO_VETTING_PLAN.md): the photos that wait for approval, oldest first, one at a time, large.
// The same screen is the Waiting list of the Vetting tab; this route stays for the Review button of a card of the list view (`?photo=<id>` opens that photo first) and for old links.
export default async function EventVettingReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ photo?: string; analysis?: string }> }) {
  const { id } = await params;
  const { photo, analysis } = await searchParams;
  if (!ObjectId.isValid(id)) notFound();
  const session = await getSession();
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, id, session!, 'manager');
  if (!access.allowed) redirect(`/admin/events/${id}`);
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) notFound();

  // The words of the event: the photos are read with them and the screen offers them.
  const vocabulary = await loadEventVocabulary(db, event);
  const analysisOnly = typeof analysis === 'string' && ObjectId.isValid(analysis);
  const queue = analysisOnly
    ? []
    : await loadPhotoQueue(db, String(event.eventId ?? ''), 'pending_review', vocabulary, 50);
  const analysisDoc = analysisOnly
    ? await db.collection(COLLECTIONS.SUBMISSIONS).findOne({
        _id: new ObjectId(analysis),
        $or: [{ eventId: String(event.eventId ?? '') }, { eventIds: { $in: [String(event.eventId ?? '')] } }],
        photoReview: { $exists: true }, reviewStatus: 'approved', isArchived: { $ne: true },
      })
    : null;
  // Review on a card of the Vetting tab opens the photo that was pressed first (issue 542, owner answer 267); the others follow, oldest first. A photo that is not waiting any more (decided meanwhile) is simply not found.
  const chosen = analysisDoc ? toPhotoQueueItem(analysisDoc, vocabulary) : typeof photo === 'string' ? queue.find((item) => item.id === photo) : undefined;
  if (analysisOnly && !chosen) notFound();
  const items = chosen ? [chosen, ...queue.filter((item) => item !== chosen)] : queue;
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <nav aria-label="Breadcrumb">
        <Link href={`/admin/events/${id}/vetting`}>Vetting</Link>
        <span aria-hidden> / </span>
        <span>Review</span>
      </nav>
      <PhotoReviewStage
        eventId={id}
        items={items}
        vocabulary={vocabulary}
        markPeople={analysisOnly || markPeopleOn(event as { markPeopleInVetting?: unknown })}
        analysisOnly={analysisOnly}
        completionHref={analysisOnly ? `/admin/events/${id}/vetting?photos=approved` : undefined}
        backHref={`/admin/events/${id}/vetting`}
        backLabel="Back to Vetting"
      />
    </div>
  );
}
