import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { ensureInheritedDefaultLandingPage } from '@/lib/landing-pages/partner-defaults';
import { inactiveEventSelfiesPath } from '@/lib/events/inactive-event-destination';

/** Stable event-specific entry point; it resolves the event's own default or materializes its current partner default. */
export default async function EventLandingPageRoute({ params }: { params: Promise<{ eventMongoId: string }> }) {
  const { eventMongoId } = await params;
  if (!ObjectId.isValid(eventMongoId)) notFound();

  const db = await connectToDatabase();
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventMongoId) });
  if (!event) notFound();
  if (event.isActive === false) redirect(inactiveEventSelfiesPath(event));

  const page = await ensureInheritedDefaultLandingPage(db, event);
  if (!page || page.isActive === false || typeof page.slug !== 'string') notFound();
  redirect(`/landing/${encodeURIComponent(page.slug)}`);
}
