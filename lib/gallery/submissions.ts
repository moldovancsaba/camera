/**
 * The photos of an event's gallery (camera#488): the approved, visible photos of the event, newest first, without those of deactivated accounts, hidden from the
 * event, archived, or still waiting for a decision (those are handled under Vetting). One filter for the page and its count.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getInactiveUserEmails } from '@/lib/db/sso';
import { CONSENT_ELIGIBLE_FILTER, ownerMediaUseMongoFilter } from '@/lib/events/consent-eligibility';
import { processingContactMongoFilter } from '@/lib/submissions/guest-contact';
import { notWaitingOrRejectedClause, plainPhotoClause } from '@/lib/submissions/visibility';

export { GALLERY_PAGE_SIZE } from '@/lib/gallery/page-size';
import { GALLERY_PAGE_SIZE } from '@/lib/gallery/page-size';

export async function galleryFilter(eventUuid: string): Promise<Document> {
  const inactiveEmails = await getInactiveUserEmails();
  // Editor-uploaded assets do not represent a guest capture and have no guest
  // consent audit. Every selfie, including legacy records, must carry a valid
  // audit and still have its image before it can appear in the event gallery.
  const hasDisplayImage = {
    $or: [
      { imageUrl: { $type: 'string', $ne: '' } },
      { finalImageUrl: { $type: 'string', $ne: '' } },
      { previewImageUrl: { $type: 'string', $ne: '' } },
    ],
  };
  const notErasedOrDeleted = {
    $and: [
      {
        $or: [
          { retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] } },
          ownerMediaUseMongoFilter('public_gallery', eventUuid),
        ],
      },
      { 'privacyErasure.state': { $nin: ['fenced', 'record_erased'] } },
      {
        $or: [
          { analyticsDeletion: { $nin: ['manual', 'automatic_no_login', 'automatic_other'] } },
          ownerMediaUseMongoFilter('public_gallery', eventUuid),
        ],
      },
    ],
  };
  return {
    $and: [
      { $or: [{ eventId: eventUuid }, { eventIds: { $in: [eventUuid] } }] },
      { isArchived: { $ne: true } },
      // A plain photo: a stored try-on result of the removed integration is not a photo of the event (issue 557).
      plainPhotoClause,
      // A picture that is gone is not shown, in any gallery (lib/media/broken.ts); the page says how many it hides.
      { 'mediaHealth.broken': { $ne: true } },
      // Waiting and rejected photos stay on Vetting. Requiring a status check
      // also keeps an erased tombstone with photoReview removed out of gallery.
      notWaitingOrRejectedClause,
      { $or: [{ photoReview: { $exists: false } }, { reviewStatus: 'approved' }, { 'metadata.adminGalleryUpload': true }] },
      { $or: [{ hiddenFromEvents: { $exists: false } }, { hiddenFromEvents: { $nin: [eventUuid] } }] },
      {
        $or: [
          // An editor supplied this asset; no guest-consent record applies.
          { $and: [{ 'metadata.adminGalleryUpload': true }, hasDisplayImage, notErasedOrDeleted] },
          // Guest photos need a complete timestamped audit. `expired` and
          // unknown consent cannot appear, even if a prior review decision remains.
          { $and: [CONSENT_ELIGIBLE_FILTER, processingContactMongoFilter, hasDisplayImage, notErasedOrDeleted] },
          // An event owner's explicit, event-scoped rights instruction is recorded separately; it does not fabricate participant consent.
          { $and: [ownerMediaUseMongoFilter('public_gallery', eventUuid), hasDisplayImage, notErasedOrDeleted] },
        ],
      },
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
