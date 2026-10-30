import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { findEventForSlideshow } from '@/lib/slideshow/resolve-event';
import { inactiveEventSelfiesPath } from '@/lib/events/inactive-event-destination';

/** An inactive event's public screen URLs resolve to its approved, consented selfies page. */
export default async function SlideshowLayoutPageShell({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ layoutId: string }>;
}) {
  const { layoutId } = await params;
  const db = await connectToDatabase();
  const layout = await db.collection(COLLECTIONS.SLIDESHOW_LAYOUTS).findOne(
    { layoutId },
    { projection: { eventId: 1 } },
  );
  if (layout && typeof layout.eventId === 'string') {
    const event = await findEventForSlideshow(db, layout.eventId);
    if (event?.isActive === false) redirect(inactiveEventSelfiesPath(event));
  }
  return children;
}
