/**
 * The event's gallery (camera#488): the photos of the event, with the upload, the bulk selection and the removal. It has its own page and menu entry; the overview of the
 * event only says how many photos there are and links here.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { Breadcrumbs, Card, Stack, Text, Title } from '@/components/gds/PublicPrimitives';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import VisibilityStatusIcon from '@/components/gds/VisibilityStatusIcon';
import EventGallery from '@/components/admin/EventGallery';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { loadGallerySubmissions, GALLERY_PAGE_SIZE } from '@/lib/gallery/submissions';
import { galleryFrameKey, loadGalleryFrames } from '@/lib/gallery/frame';
import { countBroken } from '@/lib/media/broken';
import { getPartnerScopedAccessForEvent, isGlobalAdminSession } from '@/lib/partners/authorization';
import { PRIVACY_ERASURE_ACTIVE_FILTER } from '@/lib/privacy/erasure';
import { hasOwnerMediaUseAuthorization } from '@/lib/events/consent-eligibility';

export default async function EventGalleryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();

  const session = await getSession();
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, id, session!, 'viewer');
  if (!access.allowed) redirect('/admin/events');
  const canManage = isGlobalAdminSession(session) || access.role === 'manager' || access.role === 'admin';

  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) notFound();

  const { submissions } = await loadGallerySubmissions(db, String(event.eventId), GALLERY_PAGE_SIZE);
  const galleryFrames = await loadGalleryFrames(db, event);
  const hasFrame = galleryFrames.length > 0;
  const frameOptions = galleryFrames.map((frame, index) => ({
    key: galleryFrameKey(frame),
    label: frame.frameName || (frame.variant?.message ? `Frame ${index + 1}: ${frame.variant.message}` : `Frame ${index + 1}`),
    imageUrl: frame.imageUrl,
  }));
  // Photos whose picture is gone are not listed (lib/media/broken.ts); the gallery says how many it hides.
  const hiddenBroken = await countBroken(db, [String(event.eventId), id]);
  // Photos an editor uploaded that have no frame yet (before the option existed, or uploaded with it off): the gallery offers to frame them in one press.
  const unframedUploadIds = hasFrame
    ? (await db.collection(COLLECTIONS.SUBMISSIONS).find({ eventId: event.eventId, 'metadata.adminGalleryUpload': true, 'metadata.galleryFrame': { $ne: true }, isArchived: { $ne: true }, ...PRIVACY_ERASURE_ACTIVE_FILTER }).project({ _id: 1 }).limit(500).toArray()).map((row) => String(row._id))
    : [];
  const slideshows = await db.collection(COLLECTIONS.SLIDESHOWS).find({ $or: [{ eventId: event.eventId }, { eventId: id }] }).sort({ createdAt: -1 }).toArray();
  const galleryCards = [
    ...submissions.map((submission) => ({
      _id: String(submission._id),
      imageUrl: submission.imageUrl,
      finalImageUrl: submission.finalImageUrl,
      previewImageUrl: submission.previewImageUrl,
      consentStatus: submission.consentStatus,
      userName: submission.userName,
      userInfo: submission.userInfo ? { name: submission.userInfo.name, email: submission.userInfo.email } : null,
      createdAt: submission.createdAt,
      playCount: submission.playCount,
      slideshowPlays: submission.slideshowPlays,
      canReturnToVetting: submission.reviewStatus === 'approved' && Boolean(submission.photoReview),
      galleryFrame: (submission.metadata as { galleryFrame?: boolean } | undefined)?.galleryFrame === true,
      galleryUpload: (submission.metadata as { adminGalleryUpload?: boolean } | undefined)?.adminGalleryUpload === true,
      frameId: typeof submission.frameId === 'string' ? submission.frameId : null,
      frameVariant: submission.frameVariant ?? null,
      ownerAuthorized: hasOwnerMediaUseAuthorization(submission, 'public_gallery'),
    })),
  ];

  return (
    <Stack gap="xl">
      <Breadcrumbs>
        <Link href="/admin/events">Events</Link>
        <Link href={`/admin/events/${id}`}>{String(event.name)}</Link>
        <Text>Gallery</Text>
      </Breadcrumbs>

      <WorkspaceHeader eyebrow="Events" title={`${String(event.name)} — Gallery`} description="The photos of the event: upload images, select several at once, remove them from the event." status={<VisibilityStatusIcon isVisible={event.isActive !== false} />} />

      <Card p={0}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          <Title order={2}>Event Gallery</Title>
          <Text c="dimmed" mt="xs">
            Photos of this event. Guest photos need verified consent; photos that went through vetting also need approval.
          </Text>
        </div>
        <EventGallery
          eventId={id}
          eventName={String(event.name)}
          initialSubmissions={JSON.parse(JSON.stringify(galleryCards))}
          slideshows={JSON.parse(JSON.stringify(slideshows))}
          canManage={canManage}
          hasFrame={hasFrame}
          frameOptions={canManage ? frameOptions : []}
          hiddenBroken={hiddenBroken}
          unframedUploadIds={unframedUploadIds}
        />
      </Card>
    </Stack>
  );
}
