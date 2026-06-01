import { ObjectId } from 'mongodb';
import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import TryOnResultModerationTable, { type ModerationRow } from '@/components/admin/TryOnResultModerationTable';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import { ConsumerDashboardGrid, ProductCard } from '@doneisbetter/gds-core/client';
import { AdminIcon, type AdminIconKey } from '@/lib/gds/admin-icon-key';
import { normalizeImgbbDirectUrl } from '@/lib/imgbb/url';

export const dynamic = 'force-dynamic';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default async function AdminTryOnResultsPage({
  searchParams,
}: {
  searchParams?: Promise<{ reviewStatus?: string; search?: string; archive?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const reviewStatus = typeof resolvedSearchParams?.reviewStatus === 'string' ? resolvedSearchParams.reviewStatus.trim() : '';
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';
  const archive = typeof resolvedSearchParams?.archive === 'string' ? resolvedSearchParams.archive.trim() : '';
  const archiveBucket = archive === 'approved' || archive === 'rejected' ? archive : '';

  let rows: ModerationRow[] = [];
  let dbError = null;
  let pendingCount = 0;
  let archivedApprovedCount = 0;
  let archivedRejectedCount = 0;

  try {
    const db = await connectToDatabase();
    const query: Record<string, unknown> = {
      submissionKind: 'tryon_result',
    };
    if (archiveBucket) {
      query['tryOnModerationArchive.archived'] = true;
      query['tryOnModerationArchive.bucket'] = archiveBucket;
    } else {
      query['tryOnModerationArchive.archived'] = { $ne: true };
    }
    if (reviewStatus) {
      query.reviewStatus = reviewStatus;
    }
    if (search) {
      const regex = { $regex: escapeRegex(search), $options: 'i' };
      query.$or = [
        { userName: regex },
        { userEmail: regex },
        { eventName: regex },
        { partnerName: regex },
        { tryOnLeatherSuitId: regex },
      ];
    }

    const [docs, pending, archivedApproved, archivedRejected] = await Promise.all([
      db
        .collection<Submission>(COLLECTIONS.SUBMISSIONS)
        .find(query)
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray() as Promise<Array<Submission & { _id: { toString(): string } }>>,
      db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments({
        submissionKind: 'tryon_result',
        reviewStatus: 'pending_review',
        'tryOnModerationArchive.archived': { $ne: true },
      }),
      db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments({
        submissionKind: 'tryon_result',
        'tryOnModerationArchive.archived': true,
        'tryOnModerationArchive.bucket': 'approved',
      }),
      db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments({
        submissionKind: 'tryon_result',
        'tryOnModerationArchive.archived': true,
        'tryOnModerationArchive.bucket': 'rejected',
      }),
    ]);

    pendingCount = pending;
    archivedApprovedCount = archivedApproved;
    archivedRejectedCount = archivedRejected;

    const sourceIds = docs
      .map((doc) => doc.sourceSubmissionId)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    const sourceDocs = sourceIds.length
      ? ((await db
          .collection<Submission>(COLLECTIONS.SUBMISSIONS)
          .find({ _id: { $in: sourceIds.map((value) => new ObjectId(value)) } })
          .toArray()) as Array<Submission & { _id: { toString(): string } }>)
      : [];
    const sourceMap = new Map(sourceDocs.map((doc) => [doc._id.toString(), doc]));

    rows = docs.map((doc) => {
      const source = doc.sourceSubmissionId ? sourceMap.get(doc.sourceSubmissionId) : undefined;
      return {
        id: doc._id.toString(),
        imageUrl:
          normalizeImgbbDirectUrl(doc.imageUrl ?? null) ??
          normalizeImgbbDirectUrl(doc.finalImageUrl ?? null) ??
          '',
        originalImageUrl:
          normalizeImgbbDirectUrl(source?.imageUrl ?? null) ??
          normalizeImgbbDirectUrl(source?.finalImageUrl ?? null) ??
          null,
        userName: doc.userName ?? 'Guest',
        userEmail: doc.userEmail ?? '',
        eventName: doc.eventName ?? null,
        partnerName: doc.partnerName ?? null,
        tryOnLeatherSuitId: doc.tryOnLeatherSuitId ?? null,
        reviewStatus: doc.reviewStatus ?? 'pending_review',
        createdAt: doc.createdAt,
        approvedAt: doc.approvedAt ?? null,
        isShareVisible: Boolean(doc.isShareVisible),
        isSlideshowEligible: Boolean(doc.isSlideshowEligible),
      };
    });
  } catch (error) {
    console.error('Error loading try-on moderation queue:', error);
    dbError = serializeMongoError(error);
  }

  return (
    <AdminListPageShell
      eyebrow="Apps"
      title="Try-On Vetting Queue"
      description={
        archiveBucket
          ? `Review archive for ${archiveBucket} try-on decisions. Approved items remain publishable; this archive only removes them from the active moderation queue.`
          : 'Review generated leather results before they become share-visible or slideshow-eligible.'
      }
      primaryAction={{ href: '/admin/tryon', label: 'Open Try-On App' }}
      stats={
        !dbError
          ? [
              { label: 'Pending Review', value: pendingCount, iconKey: 'photoScan' },
              { label: 'Archived Approved', value: archivedApprovedCount, iconKey: 'world' },
              { label: 'Archived Rejected', value: archivedRejectedCount, iconKey: 'photo' },
            ]
          : undefined
      }
      search={{
        defaultValue: search,
        label: 'Search queue',
        placeholder: 'Search by user, email, event, partner, or suit',
        clearHref: archiveBucket ? `/admin/tryon-results?archive=${archiveBucket}` : '/admin/tryon-results',
        hiddenFields: {
          ...(reviewStatus ? { reviewStatus } : {}),
          ...(archiveBucket ? { archive: archiveBucket } : {}),
        },
      }}
      toolbarHint={
        archiveBucket
          ? 'Search archived try-on decisions or return to the active review queue.'
          : 'Search the queue directly or jump to the pending-only review view.'
      }
      toolbarFilters={
        [
          ...(archiveBucket ? [{ label: 'Archive', value: archiveBucket }] : []),
          ...(reviewStatus ? [{ label: 'Review Status', value: reviewStatus.replace(/_/g, ' ') }] : []),
          ...(search ? [{ label: 'Search', value: search }] : []),
        ].length > 0
          ? [
              ...(archiveBucket ? [{ label: 'Archive', value: archiveBucket }] : []),
              ...(reviewStatus ? [{ label: 'Review Status', value: reviewStatus.replace(/_/g, ' ') }] : []),
              ...(search ? [{ label: 'Search', value: search }] : []),
            ]
          : undefined
      }
      toolbarTrailing={{
        href: archiveBucket
          ? '/admin/tryon-results'
          : search
            ? `/admin/tryon-results?reviewStatus=pending_review&search=${encodeURIComponent(search)}`
            : '/admin/tryon-results?reviewStatus=pending_review',
        label: archiveBucket ? 'Active queue' : 'Pending only',
      }}
      dbError={dbError}
    >
      <ConsumerDashboardGrid columns={3}>
        {[
          {
            href: '/admin/tryon-results',
            title: `Active Queue (${pendingCount})`,
            description: 'Open the live moderation queue for pending try-on results.',
            iconKey: 'photoScan' as AdminIconKey,
          },
          {
            href: '/admin/tryon-results?archive=approved',
            title: `Archived Approved (${archivedApprovedCount})`,
            description: 'Browse approved items that were archived out of the active vetting queue.',
            iconKey: 'world' as AdminIconKey,
          },
          {
            href: '/admin/tryon-results?archive=rejected',
            title: `Archived Rejected (${archivedRejectedCount})`,
            description: 'Browse declined items that were archived out of the active vetting queue.',
            iconKey: 'photo' as AdminIconKey,
          },
        ].map((item) => (
          <ProductCard
            key={item.href}
            title={item.title}
            description={item.description}
            icon={<AdminIcon iconKey={item.iconKey} size={20} />}
            primaryAction={
              <a href={item.href} style={{ textDecoration: 'none' }}>
                Open
              </a>
            }
          />
        ))}
      </ConsumerDashboardGrid>
      <TryOnResultModerationTable
        rows={rows}
        emptyTitle={archiveBucket ? `No archived ${archiveBucket} try-on results` : undefined}
        emptyDescription={
          archiveBucket
            ? `Approved or rejected try-on results will appear here after they are archived out of the live moderation queue.`
            : undefined
        }
      />
    </AdminListPageShell>
  );
}
