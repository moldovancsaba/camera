import { ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import {
  getTryOnIdentityClassification,
  isActionableIdentityGap,
  resolveTryOnSubmissionIdentity,
} from '@/lib/tryon/identity';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) {
    throw apiForbidden('Global admin access is required');
  }

  const status = request.nextUrl.searchParams.get('status')?.trim() || 'actionable';
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

  const rows = docs
    .map((doc) => {
      const source = doc.sourceSubmissionId ? sourceMap.get(doc.sourceSubmissionId) ?? null : null;
      const classification = getTryOnIdentityClassification(doc);
      const actionable = isActionableIdentityGap(doc, source);
      const identity = resolveTryOnSubmissionIdentity(doc, source);
      return {
        id: doc._id?.toString() ?? '',
        eventName: doc.eventName ?? null,
        createdAt: doc.createdAt,
        sourceJobId: doc.sourceJobId ?? null,
        imageUrl: doc.imageUrl ?? doc.finalImageUrl ?? null,
        userName: identity.name,
        userEmail: identity.email ?? '',
        classificationStatus: classification?.status ?? (actionable ? 'unreviewed_guest' : 'resolved'),
        classificationReviewedAt: classification?.reviewedAt ?? null,
        classificationReviewedBy: classification?.reviewedBy ?? null,
        classificationReason: classification?.reason ?? null,
        actionable,
        sourceRecoverable: Boolean(source && resolveTryOnSubmissionIdentity(doc, source).email),
      };
    })
    .filter((row) => {
      if (status === 'all') return true;
      if (status === 'reviewed') return row.classificationStatus === 'reviewed_unrecoverable';
      return row.actionable;
    });

  return apiSuccess({ results: rows, total: rows.length });
});
