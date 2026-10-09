/**
 * The photos of an event's gallery (camera#488): the approved, visible photos of the event, newest first, without those of deactivated accounts, hidden from the
 * event, archived, or still waiting for a decision (those are handled under Vetting). One filter for the page and its count.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getInactiveUserEmails } from '@/lib/db/sso';

export { GALLERY_PAGE_SIZE } from '@/lib/gallery/page-size';
import { GALLERY_PAGE_SIZE } from '@/lib/gallery/page-size';

export async function galleryFilter(eventUuid: string): Promise<Document> {
  const inactiveEmails = await getInactiveUserEmails();
  return {
    $and: [
      { $or: [{ eventId: eventUuid }, { eventIds: { $in: [eventUuid] } }] },
      { isArchived: { $ne: true } },
      // A picture that is gone is not shown, in any gallery (lib/media/broken.ts); the page says how many it hides.
      { 'mediaHealth.broken': { $ne: true } },
      // A photo of a vetted event that is waiting or rejected is handled under Photos, not shown in the gallery (camera#268).
      { $or: [{ photoReview: { $exists: false } }, { reviewStatus: 'approved' }] },
      { $or: [{ hiddenFromEvents: { $exists: false } }, { hiddenFromEvents: { $nin: [eventUuid] } }] },
      {
        $and: [
          { $or: [{ userEmail: { $nin: Array.from(inactiveEmails) } }, { userId: 'anonymous' }] },
          { $or: [{ 'userInfo.isActive': { $ne: false } }, { userInfo: { $exists: false } }] },
        ],
      },
    ],
  };
}

export async function loadGallerySubmissions(db: Db, eventUuid: string, limit: number = GALLERY_PAGE_SIZE): Promise<{ submissions: Document[]; total: number }> {
  const filter = await galleryFilter(eventUuid);
  const submissions = await db.collection(COLLECTIONS.SUBMISSIONS).find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  const total = await db.collection(COLLECTIONS.SUBMISSIONS).countDocuments(filter);
  return { submissions, total };
}
