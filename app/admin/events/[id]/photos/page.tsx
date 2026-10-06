/**
 * The Photos tab of an event workspace (camera#268, docs/PHOTO_VETTING_PLAN.md): the setting that makes new photos wait for approval,
 * and the queue where event managers and global admins approve or reject them. Waiting photos are shown oldest first.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { Stack, Text, Title } from '@/components/gds/PublicPrimitives';
import PhotoReviewQueue from '@/components/admin/PhotoReviewQueue';
import PhotoVettingSwitch from '@/components/admin/PhotoVettingSwitch';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getPartnerScopedAccessForEvent, isGlobalAdminSession } from '@/lib/partners/authorization';
import { photoVettingRequired } from '@/lib/events/photo-vetting';
import { countPhotoQueue, isQueueStatus, loadPhotoQueue, type QueueStatus } from '@/lib/photo-vetting/queue';

export const dynamic = 'force-dynamic';

const TAB_LABEL: Record<QueueStatus, string> = { pending_review: 'Waiting', rejected: 'Rejected', approved: 'Approved' };

export default async function EventPhotosTab({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const query = searchParams ? await searchParams : {};
  const status: QueueStatus = isQueueStatus(query.status) ? query.status : 'pending_review';

  const session = await getSession();
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, id, session!, 'manager');
  if (!access.allowed) redirect(`/admin/events/${id}`);

  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) notFound();

  const eventUuid = String(event.eventId ?? '');
  const [items, counts] = await Promise.all([loadPhotoQueue(db, eventUuid, status), countPhotoQueue(db, eventUuid)]);
  const required = photoVettingRequired(event as { photoVetting?: { required?: unknown } });

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Photos</Title>
        <Text size="sm" c="dimmed">
          Photos of {String(event.name ?? 'this event')} wait here for approval while vetting is on. Approving puts the frame on the photo, publishes it and emails the guest the link.
        </Text>
      </div>

      <PhotoVettingSwitch eventId={id} required={required} canChange={isGlobalAdminSession(session)} />

      <nav aria-label="Photo status" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {(Object.keys(TAB_LABEL) as QueueStatus[]).map((tab) => {
          const active = tab === status;
          return (
            <Link
              key={tab}
              href={`/admin/events/${id}/photos?status=${tab}`}
              aria-current={active ? 'page' : undefined}
              style={{
                borderRadius: 8,
                padding: '0.4rem 0.75rem',
                fontSize: '0.875rem',
                fontWeight: active ? 700 : 500,
                textDecoration: 'none',
                background: active ? 'var(--mantine-color-blue-0)' : 'transparent',
                color: active ? 'var(--mantine-color-blue-7)' : 'var(--mantine-color-dimmed)',
              }}
            >
              {TAB_LABEL[tab]} ({counts[tab]})
            </Link>
          );
        })}
      </nav>

      <PhotoReviewQueue key={status} status={status} initialItems={items} canReview />
    </Stack>
  );
}
