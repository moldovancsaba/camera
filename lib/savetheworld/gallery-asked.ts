import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { effectiveGalleryConsent } from '@/lib/events/gallery-consent';

/**
 * Whether an event asks for the public-gallery permission (issue 554): its own setting, else its partner's,
 * else not. No event found means not asked, which keeps the filters of the wall and the bulk publish as they were.
 */
export async function eventAsksForGalleryPermission(db: Db, event: Record<string, unknown> | null): Promise<boolean> {
  if (!event) return false;
  if (typeof event.galleryConsent === 'boolean') return event.galleryConsent;
  const partner = event.partnerId
    ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: event.partnerId }, { projection: { galleryConsent: 1 } })
    : null;
  return effectiveGalleryConsent(event, partner as { galleryConsent?: unknown } | null);
}
