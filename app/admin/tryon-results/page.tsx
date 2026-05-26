import { ObjectId } from 'mongodb';
import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AdminListPageShell from '@/components/gds/AdminListPageShell';
import TryOnResultModerationTable, { type ModerationRow } from '@/components/admin/TryOnResultModerationTable';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';

export const dynamic = 'force-dynamic';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default async function AdminTryOnResultsPage({
  searchParams,
}: {
  searchParams?: Promise<{ reviewStatus?: string; search?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const reviewStatus = typeof resolvedSearchParams?.reviewStatus === 'string' ? resolvedSearchParams.reviewStatus.trim() : '';
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';

  let rows: ModerationRow[] = [];
  let dbError = null;

  try {
    const db = await connectToDatabase();
    const query: Record<string, unknown> = {
      submissionKind: 'tryon_result',
      isArchived: { $ne: true },
    };
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

    const docs = (await db
      .collection<Submission>(COLLECTIONS.SUBMISSIONS)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray()) as Array<Submission & { _id: { toString(): string } }>;

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
        imageUrl: doc.imageUrl ?? doc.finalImageUrl,
        originalImageUrl: source?.imageUrl ?? source?.finalImageUrl ?? null,
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
      description="Review generated leather results before they become share-visible or slideshow-eligible."
      primaryAction={{ href: '/admin/tryon', label: 'Open Try-On App' }}
      stats={
        !dbError
          ? [
              { label: 'Pending Review', value: rows.filter((row) => row.reviewStatus === 'pending_review').length, iconKey: 'photoScan' },
              { label: 'Approved', value: rows.filter((row) => row.reviewStatus === 'approved').length, iconKey: 'world' },
              { label: 'Rejected', value: rows.filter((row) => row.reviewStatus === 'rejected').length, iconKey: 'photo' },
            ]
          : undefined
      }
      search={{
        defaultValue: search,
        label: 'Search queue',
        placeholder: 'Search by user, email, event, partner, or suit',
        clearHref: '/admin/tryon-results',
        hiddenFields: reviewStatus ? { reviewStatus } : undefined,
      }}
      toolbarHint="Search the queue directly or jump to the pending-only review view."
      toolbarFilters={
        [
          ...(reviewStatus ? [{ label: 'Review Status', value: reviewStatus.replace(/_/g, ' ') }] : []),
          ...(search ? [{ label: 'Search', value: search }] : []),
        ].length > 0
          ? [
              ...(reviewStatus ? [{ label: 'Review Status', value: reviewStatus.replace(/_/g, ' ') }] : []),
              ...(search ? [{ label: 'Search', value: search }] : []),
            ]
          : undefined
      }
      toolbarTrailing={{
        href: search
          ? `/admin/tryon-results?reviewStatus=pending_review&search=${encodeURIComponent(search)}`
          : '/admin/tryon-results?reviewStatus=pending_review',
        label: 'Pending only',
      }}
      dbError={dbError}
    >
      <TryOnResultModerationTable rows={rows} />
    </AdminListPageShell>
  );
}
