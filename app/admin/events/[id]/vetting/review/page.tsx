import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ObjectId } from 'mongodb';
import PhotoReviewStage from '@/components/admin/PhotoReviewStage';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { loadPhotoQueue } from '@/lib/photo-vetting/queue';
import { loadEventVocabulary } from '@/lib/photo-vetting/vocabulary-load';

export const dynamic = 'force-dynamic';

/** One-at-a-time publication vetting. All analytics review stays on the unified Fanmass result. */
export default async function EventVettingReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ photo?: string; analysis?: string }> }) {
  const { id } = await params;
  const { photo, analysis } = await searchParams;
  if (!ObjectId.isValid(id)) notFound();
  if (analysis) redirect(`/admin/events/${id}/analysis?photos=analysed`);

  const session = await getSession();
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, id, session!, 'manager');
  if (!access.allowed) redirect(`/admin/events/${id}`);
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) notFound();

  const vocabulary = await loadEventVocabulary(db, event);
  const queue = await loadPhotoQueue(db, String(event.eventId ?? ''), 'pending_review', 50);
  const chosen = typeof photo === 'string' ? queue.find((item) => item.id === photo) : undefined;
  const items = chosen ? [chosen, ...queue.filter((item) => item.id !== chosen.id)] : queue;
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <nav aria-label="Breadcrumb">
        <Link href={`/admin/events/${id}/vetting`}>Vetting</Link>
        <span aria-hidden> / </span>
        <span>Review</span>
      </nav>
      <PhotoReviewStage eventId={id} items={items} vocabulary={vocabulary} backHref={`/admin/events/${id}/vetting`} backLabel="Back to Vetting" />
    </div>
  );
}
