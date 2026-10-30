import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { SimpleGrid, Stack, Title } from '@/components/gds/PublicPrimitives';
import PublicShell from '@/components/public/PublicPageShell';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { CONSENT_ELIGIBLE_FILTER } from '@/lib/events/consent-eligibility';
import { plainPhotoClause } from '@/lib/submissions/visibility';

export const dynamic = 'force-dynamic';

/**
 * The event's public destination when capture is disabled. Only approved plain
 * photos with a valid consent audit and explicit public-gallery visibility are
 * shown. The former try-on-only Greatest Hits page was removed; this page uses
 * the Camera photo contract and never treats missing consent as permission.
 */
export default async function GreatestSelfiesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug ?? '').trim().toLowerCase();
  if (!slug) notFound();

  const db = await connectToDatabase();
  const eventCandidates: Record<string, unknown>[] = [{ greatestHitsSlug: slug }, { eventId: slug }];
  if (ObjectId.isValid(slug)) eventCandidates.push({ _id: new ObjectId(slug) });
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ $or: eventCandidates });
  if (!event?._id || typeof event.eventId !== 'string') notFound();

  const eventKeys = [event.eventId, event._id.toString()];
  const photos = await db.collection(COLLECTIONS.SUBMISSIONS).find({
    $and: [
      { $or: [{ eventId: { $in: eventKeys } }, { eventIds: { $in: eventKeys } }] },
      { reviewStatus: 'approved', isShareVisible: true, isArchived: { $ne: true } },
      { 'mediaHealth.broken': { $ne: true } },
      { retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] } },
      { analyticsDeletion: { $nin: ['manual', 'automatic_no_login', 'automatic_other'] } },
      { 'privacyErasure.state': { $nin: ['fenced', 'record_erased'] } },
      { $or: [{ hiddenFromEvents: { $exists: false } }, { hiddenFromEvents: { $nin: eventKeys } }] },
      plainPhotoClause,
      CONSENT_ELIGIBLE_FILTER,
    ],
  }, { projection: { _id: 1, imageUrl: 1, finalImageUrl: 1 } })
    .sort({ approvedAt: -1, createdAt: -1 })
    .limit(200)
    .toArray();

  return (
    <PublicShell size="xl">
      <Stack gap="lg">
        <Title order={1} ta="center">{String(event.name ?? '')}</Title>
        {photos.length > 0 && <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
          {photos.map((photo) => {
            const imageUrl = typeof photo.imageUrl === 'string' && photo.imageUrl
              ? photo.imageUrl
              : typeof photo.finalImageUrl === 'string' ? photo.finalImageUrl : '';
            if (!imageUrl) return null;
            return (
              <div key={String(photo._id)} style={{ aspectRatio: '1', borderRadius: '1rem', overflow: 'hidden', position: 'relative' }}>
                <Image src={imageUrl} alt={String(event.name ?? 'Event photo')} fill unoptimized sizes="(max-width: 48rem) 100vw, 33vw" style={{ objectFit: 'contain' }} />
              </div>
            );
          })}
        </SimpleGrid>}
      </Stack>
    </PublicShell>
  );
}
