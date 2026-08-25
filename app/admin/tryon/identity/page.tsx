import { redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import TryOnIdentityReviewTable, { type IdentityReviewRow } from '@/components/admin/TryOnIdentityReviewTable';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import {
  getTryOnIdentityClassification,
  isActionableIdentityGap,
  resolveTryOnSubmissionIdentity,
} from '@/lib/tryon/identity';

export const dynamic = 'force-dynamic';

export default async function AdminTryOnIdentityPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const status = typeof resolvedSearchParams.status === 'string' ? resolvedSearchParams.status.trim() : 'actionable';

  let rows: IdentityReviewRow[] = [];
  let dbError = null;

  try {
    const db = await connectToDatabase();
    const docs = await db
      .collection<Submission>(COLLECTIONS.SUBMISSIONS)
      .find({ submissionKind: 'tryon_result' })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();

    const sourceIds = docs
      .map((doc) => doc.sourceSubmissionId)
      .filter((value): value is string => typeof value === 'string' && ObjectId.isValid(value))
      .map((value) => new ObjectId(value));
    const sources = sourceIds.length
      ? await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).find({ _id: { $in: sourceIds } }).toArray()
      : [];
    const sourceMap = new Map(sources.map((source) => [source._id?.toString() ?? '', source]));

    rows = docs
      .map((doc) => {
        const source = doc.sourceSubmissionId ? sourceMap.get(doc.sourceSubmissionId) ?? null : null;
        const classification = getTryOnIdentityClassification(doc);
        const actionable = isActionableIdentityGap(doc, source);
        const identity = resolveTryOnSubmissionIdentity(doc, source);
        return {
          id: doc._id?.toString() ?? '',
          eventName: doc.eventName ?? null,
          createdAt: doc.createdAt,
          userName: identity.name,
          userEmail: identity.email ?? '',
          classificationStatus: classification?.status ?? (actionable ? 'unreviewed_guest' : 'resolved'),
          actionable,
        };
      })
      .filter((row) => {
        if (status === 'all') return true;
        if (status === 'reviewed') return row.classificationStatus === 'reviewed_unrecoverable';
        return row.actionable;
      });
  } catch (error) {
    console.error('Error loading try-on identity review:', error);
    dbError = serializeMongoError(error);
  }

  const actionableCount = rows.filter((row) => row.actionable).length;

  return (
    <AdminListPageShell
      eyebrow="Apps"
      title="Try-On Identity Cleanup"
      primaryAction={{ href: '/admin/tryon', label: 'Open Try-On App' }}
      stats={[
        { label: 'Visible rows', value: rows.length, iconKey: 'users' },
        { label: 'Actionable gaps', value: actionableCount, iconKey: 'users' },
      ]}
      toolbarTrailing={{ href: '/admin/tryon/vetting', label: 'Open Vetting' }}
      dbError={dbError}
    >
      {dbError ? <DatabaseConnectionAlert diagnosis={dbError} /> : null}
      {!dbError ? <TryOnIdentityReviewTable rows={rows} /> : null}
    </AdminListPageShell>
  );
}
