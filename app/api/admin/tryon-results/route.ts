import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) {
    throw apiForbidden('Global admin access is required');
  }

  const { searchParams } = request.nextUrl;
  const reviewStatus = searchParams.get('reviewStatus')?.trim();
  const eventId = searchParams.get('eventId')?.trim();
  const partnerId = searchParams.get('partnerId')?.trim();
  const limit = Math.max(1, Math.min(100, Number.parseInt(searchParams.get('limit') || '50', 10) || 50));

  const query: Record<string, unknown> = {
    submissionKind: 'tryon_result',
    isArchived: { $ne: true },
  };

  if (reviewStatus) {
    query.reviewStatus = reviewStatus;
  }
  if (eventId) {
    query.$or = [{ eventId }, { eventIds: { $in: [eventId] } }];
  }
  if (partnerId) {
    query.partnerId = partnerId;
  }

  const db = await connectToDatabase();
  const docs = (await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()) as Array<Submission & { _id: ObjectId }>;

  const sourceIds = docs
    .map((doc) => doc.sourceSubmissionId)
    .filter((value): value is string => typeof value === 'string' && ObjectId.isValid(value))
    .map((value) => new ObjectId(value));

  const sourceMap = new Map<string, Submission & { _id: ObjectId }>();
  if (sourceIds.length > 0) {
    const sourceDocs = (await db
      .collection<Submission>(COLLECTIONS.SUBMISSIONS)
      .find({ _id: { $in: sourceIds } })
      .toArray()) as Array<Submission & { _id: ObjectId }>;
    for (const sourceDoc of sourceDocs) {
      sourceMap.set(sourceDoc._id.toString(), sourceDoc);
    }
  }

  return apiSuccess({
    results: docs.map((doc) => {
      const source = doc.sourceSubmissionId ? sourceMap.get(doc.sourceSubmissionId) : null;
      return {
        id: doc._id.toString(),
        sourceSubmissionId: doc.sourceSubmissionId ?? null,
        sourceJobId: doc.sourceJobId ?? null,
        reviewStatus: doc.reviewStatus ?? 'pending_review',
        imageUrl: doc.imageUrl ?? doc.finalImageUrl ?? '',
        originalImageUrl: source?.imageUrl ?? source?.finalImageUrl ?? null,
        userName: doc.userName ?? 'Guest',
        userEmail: doc.userEmail ?? '',
        eventName: doc.eventName ?? null,
        partnerName: doc.partnerName ?? null,
        tryOnLeatherSuitId: doc.tryOnLeatherSuitId ?? null,
        createdAt: doc.createdAt,
        approvedAt: doc.approvedAt ?? null,
        isShareVisible: Boolean(doc.isShareVisible),
        isSlideshowEligible: Boolean(doc.isSlideshowEligible),
      };
    }),
  });
});
