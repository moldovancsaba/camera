import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { Breadcrumbs, Stack, Text } from '@/components/gds/PublicPrimitives';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import FanmassPhotoResultReview from '@/components/admin/FanmassPhotoResultReview';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { loadFanmassEventPhoto, loadFanmassEventPhotoNeighbors } from '@/lib/fanmass/photo-results';

export const dynamic = 'force-dynamic';

export default async function FanmassPhotoResultReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photo?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!ObjectId.isValid(id) || !query.photo || !ObjectId.isValid(query.photo)) notFound();

  const session = await getSession();
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, id, session!, 'manager');
  if (!access.allowed) redirect(`/admin/events/${id}`);
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) notFound();
  const eventUuid = String(event.eventId ?? '');
  if (!eventUuid) notFound();

  const photoObjectId = new ObjectId(query.photo);
  const [item, neighbors] = await Promise.all([
    loadFanmassEventPhoto(db, eventUuid, event, photoObjectId),
    loadFanmassEventPhotoNeighbors(db, eventUuid, event, photoObjectId),
  ]);
  if (!item || !neighbors) notFound();

  return (
    <Stack gap="md">
      <Breadcrumbs>
        <Link href="/admin/events">Events</Link>
        <Link href={`/admin/events/${id}`}>{String(event.name ?? 'Event')}</Link>
        <Link href={`/admin/events/${id}/analysis?photos=fanmass`}>Fanmass results</Link>
        <Text>Review one photo</Text>
      </Breadcrumbs>
      <WorkspaceHeader
        eyebrow="Photo analysis"
        title={`${String(event.name ?? 'Event')} — Fanmass result`}
        description="Review this photo’s result and detection boxes. Confirming records a human check in Camera and leaves the Fanmass result unchanged."
        status={item.queueStatus === 'completed' ? 'Ready for review' : item.queueStatus}
      />
      <FanmassPhotoResultReview eventId={id} item={item} previousId={neighbors.previousId} nextId={neighbors.nextId} />
    </Stack>
  );
}
