/**
 * Admin Submissions Page
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { redirect } from 'next/navigation';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import SubmissionsInventoryList, { type SerializedSubmissionRow } from '@/components/gds/SubmissionsInventoryList';
import { mongoIdString } from '@/lib/gds/serialize-admin-rows';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';

export const dynamic = 'force-dynamic';

interface SubmissionGalleryItem {
  _id?: unknown;
  imageUrl: string;
  previewImageUrl?: string | null;
  userName: string;
  userEmail: string;
  partnerId?: string | null;
  eventId?: string | null;
  frameName?: string;
  createdAt: string;
  playCount?: number;
}

interface PartnerRef {
  _id?: unknown;
  partnerId: string;
  name: string;
}

interface EventRef {
  _id?: unknown;
  eventId: string;
  name: string;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function meaningfulIdentityExpression() {
  return {
    $let: {
      vars: {
        email: { $toLower: { $trim: { input: { $ifNull: ['$userEmail', ''] } } } },
        userInfoEmail: { $toLower: { $trim: { input: { $ifNull: ['$userInfo.email', ''] } } } },
        name: { $toLower: { $trim: { input: { $ifNull: ['$userName', ''] } } } },
        userInfoName: { $toLower: { $trim: { input: { $ifNull: ['$userInfo.name', ''] } } } },
      },
      in: {
        $switch: {
          branches: [
            {
              case: {
                $and: [
                  { $ne: ['$$userInfoEmail', ''] },
                  { $not: { $in: ['$$userInfoEmail', ['anonymous@event', 'anonymous@event.com', 'unknown@unknown.com']] } },
                ],
              },
              then: '$$userInfoEmail',
            },
            {
              case: {
                $and: [
                  { $ne: ['$$email', ''] },
                  { $not: { $in: ['$$email', ['anonymous@event', 'anonymous@event.com', 'unknown@unknown.com']] } },
                ],
              },
              then: '$$email',
            },
            {
              case: {
                $and: [
                  { $ne: ['$$userInfoName', ''] },
                  { $not: { $in: ['$$userInfoName', ['event guest', 'anonymous user', 'unknown']] } },
                ],
              },
              then: '$$userInfoName',
            },
            {
              case: {
                $and: [
                  { $ne: ['$$name', ''] },
                  { $not: { $in: ['$$name', ['event guest', 'anonymous user', 'unknown']] } },
                ],
              },
              then: '$$name',
            },
          ],
          default: null,
        },
      },
    },
  };
}

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }

  let submissionRows: SerializedSubmissionRow[] = [];
  let galleryItemCount = 0;
  let namedUserCount = 0;
  let partnerScopedCount = 0;
  let dbError = null;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';

  try {
    const db = await connectToDatabase();
    const query: Record<string, unknown> = { isArchived: false };
    if (search) {
      query.$or = [
        { userName: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } },
        { eventName: { $regex: search, $options: 'i' } },
        { partnerName: { $regex: search, $options: 'i' } },
        { frameName: { $regex: search, $options: 'i' } },
      ];
    }

    const [submissionDocs, totalCount, namedUsers, scopedCount] = await Promise.all([
      db
        .collection(COLLECTIONS.SUBMISSIONS)
        .find(query)
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray(),
      db.collection(COLLECTIONS.SUBMISSIONS).countDocuments(query),
      db
        .collection(COLLECTIONS.SUBMISSIONS)
        .aggregate<{ count: number }>([
          { $match: query },
          { $project: { identity: meaningfulIdentityExpression() } },
          { $match: { identity: { $type: 'string', $ne: '' } } },
          { $group: { _id: '$identity' } },
          { $count: 'count' },
        ])
        .toArray(),
      db.collection(COLLECTIONS.SUBMISSIONS).countDocuments({
        ...query,
        partnerId: { $type: 'string', $ne: '' },
      }),
    ]);
    galleryItemCount = totalCount;
    namedUserCount = namedUsers[0]?.count ?? 0;
    partnerScopedCount = scopedCount;
    const submissions = submissionDocs as unknown as SubmissionGalleryItem[];

    const partnerIds = Array.from(
      new Set(
        submissions
          .map((submission) => submission.partnerId)
          .filter((partnerId): partnerId is string => typeof partnerId === 'string' && partnerId.trim().length > 0)
      )
    );
    const eventIds = Array.from(
      new Set(
        submissions
          .map((submission) => submission.eventId)
          .filter((eventId): eventId is string => typeof eventId === 'string' && eventId.trim().length > 0)
      )
    );

    const partnerById = new Map<string, PartnerRef>();
    const eventById = new Map<string, EventRef>();

    if (partnerIds.length > 0) {
      const partners = (await db
        .collection(COLLECTIONS.PARTNERS)
        .find({ partnerId: { $in: partnerIds } })
        .toArray()) as unknown as PartnerRef[];
      for (const partner of partners) {
        partnerById.set(partner.partnerId, partner);
      }
    }

    if (eventIds.length > 0) {
      const events = (await db
        .collection(COLLECTIONS.EVENTS)
        .find({ eventId: { $in: eventIds } })
        .toArray()) as unknown as EventRef[];
      for (const event of events) {
        eventById.set(event.eventId, event);
      }
    }

    submissionRows = [];
    for (const submission of submissions) {
      const id = mongoIdString(submission._id);
      if (!id) continue;
      const partner = submission.partnerId ? partnerById.get(submission.partnerId) : undefined;
      const event = submission.eventId ? eventById.get(submission.eventId) : undefined;
      submissionRows.push({
        id,
        imageUrl: submission.imageUrl ?? '',
        previewImageUrl: submission.previewImageUrl ?? null,
        userName: submission.userName ?? '',
        userEmail: submission.userEmail ?? '',
        frameName: submission.frameName ?? null,
        createdAtLabel: formatDateTime(submission.createdAt),
        playCount: submission.playCount,
        partnerAdminId: mongoIdString(partner?._id),
        partnerName: partner?.name ?? null,
        eventAdminId: mongoIdString(event?._id),
        eventName: event?.name ?? null,
      });
    }
  } catch (error) {
    console.error('Error fetching submissions:', error);
    dbError = serializeMongoError(error);
  }

  return (
    <AdminListPageShell
      eyebrow="Resource Inventory"
      title="Global Galleries"
      stats={
        !dbError
          ? [
              { label: 'Gallery Items', value: galleryItemCount, iconKey: 'photoScan' },
              {
                label: 'Named Users',
                value: namedUserCount,
                iconKey: 'user',
              },
              {
                label: 'Partner-scoped',
                value: partnerScopedCount,
                iconKey: 'world',
              },
            ]
          : undefined
      }
      search={{
        defaultValue: search,
        label: 'Search',
        placeholder: 'Search user, email, partner, event, or frame',
        clearHref: '/admin/submissions',
      }}
      dbError={dbError}
    >
      <SubmissionsInventoryList submissions={submissionRows} totalCount={galleryItemCount} />
    </AdminListPageShell>
  );
}
