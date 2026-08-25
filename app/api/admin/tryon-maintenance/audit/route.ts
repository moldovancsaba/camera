import { ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { getTryOnIdentityClassification, isActionableIdentityGap, isTryOnPlaceholderEmail } from '@/lib/tryon/identity';

// WHAT: The read-only checks from scripts/audit-tryon-data-integrity.ts,
// reimplemented here rather than imported -- a `scripts/*.ts` file runs its
// own main()/process.exit() as a side effect of import, so it can't be
// reused as a library. The script itself is untouched and still works as a
// CLI. This is read-only (no writes), so duplicating the query logic here
// carries no correctness-drift risk the way duplicating a write path would.
function hasGuestIdentity(doc: Submission): boolean {
  const nameValue = doc.userInfo?.name ?? doc.userName;
  const name = typeof nameValue === 'string' ? nameValue.trim() : '';
  return isTryOnPlaceholderEmail(doc.userEmail) || !name || name === 'Guest' || name === 'Event Guest';
}

function hasUsableIdentity(doc: Submission | null | undefined): boolean {
  if (!doc) return false;
  const nameValue = doc.userInfo?.name ?? doc.userName;
  const name = typeof nameValue === 'string' ? nameValue.trim() : '';
  const hasName = Boolean(name && name !== 'Guest' && name !== 'Event Guest');
  const hasEmail = !isTryOnPlaceholderEmail(doc.userInfo?.email ?? doc.userEmail);
  return hasName || hasEmail;
}

export const GET = withErrorHandler(async (_request: NextRequest) => {
  const session = await requireAuth(_request);
  if (!isGlobalAdminSession(session)) {
    throw apiForbidden('Global admin access is required');
  }

  const db = await connectToDatabase();

  const garments = await db.collection(COLLECTIONS.LEATHER_SUITS).find({}, { projection: { leatherSuitId: 1 } }).toArray();
  const garmentIds = new Set(garments.map((garment) => garment.leatherSuitId).filter(Boolean));
  const resultGarments = await db.collection(COLLECTIONS.SUBMISSIONS).aggregate([
    { $match: { submissionKind: 'tryon_result' } },
    { $group: { _id: '$tryOnLeatherSuitId', count: { $sum: 1 } } },
  ]).toArray();
  const jobGarments = await db.collection(COLLECTIONS.TRYON_JOBS).aggregate([
    { $group: { _id: '$request.leatherSuitId', count: { $sum: 1 } } },
  ]).toArray();
  const unknownGarments = {
    resultSubmissions: resultGarments.filter((row) => row._id && !garmentIds.has(row._id)),
    jobs: jobGarments.filter((row) => row._id && !garmentIds.has(row._id)),
  };

  const identityDocs = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).find({ submissionKind: 'tryon_result' }).toArray();
  const guestDocs = identityDocs.filter(hasGuestIdentity);
  const sourceIds = guestDocs
    .map((doc) => doc.sourceSubmissionId)
    .filter((value): value is string => typeof value === 'string' && ObjectId.isValid(value))
    .map((value) => new ObjectId(value));
  const sources = sourceIds.length ? await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).find({ _id: { $in: sourceIds } }).toArray() : [];
  const sourceMap = new Map(sources.map((source) => [source._id?.toString() ?? '', source]));
  const sourceRecoverable = guestDocs.filter((doc) => {
    const source = doc.sourceSubmissionId ? sourceMap.get(doc.sourceSubmissionId) : null;
    return hasUsableIdentity(source);
  });
  const reviewedUnrecoverable = guestDocs.filter((doc) => getTryOnIdentityClassification(doc)?.status === 'reviewed_unrecoverable');
  const unreviewedActionable = guestDocs.filter((doc) => {
    const source = doc.sourceSubmissionId ? sourceMap.get(doc.sourceSubmissionId) : null;
    return isActionableIdentityGap(doc, source);
  });

  const supersededMissingReason = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments({
    submissionKind: 'tryon_result',
    $and: [
      { $or: [{ 'metadata.tryOnSupersededByRerun': true }, { 'metadata.tryOnSupersededByJobId': { $type: 'string' } }] },
      { $or: [{ 'tryOnModerationArchive.reason': { $exists: false } }, { 'tryOnModerationArchive.reason': null }] },
    ],
  });

  const doneJobsMissingResults = await db.collection(COLLECTIONS.TRYON_JOBS).aggregate([
    { $match: { status: 'done' } },
    { $lookup: { from: COLLECTIONS.SUBMISSIONS, localField: 'jobId', foreignField: 'sourceJobId', as: 'result' } },
    { $match: { result: { $size: 0 } } },
    { $project: { _id: 0, jobId: 1, createdAt: 1, updatedAt: 1 } },
    { $limit: 25 },
  ]).toArray();
  const doneJobsMissingResultsTotal = await db.collection(COLLECTIONS.TRYON_JOBS).aggregate([
    { $match: { status: 'done' } },
    { $lookup: { from: COLLECTIONS.SUBMISSIONS, localField: 'jobId', foreignField: 'sourceJobId', as: 'result' } },
    { $match: { result: { $size: 0 } } },
    { $count: 'total' },
  ]).toArray();

  const inconsistentModeration = await db.collection(COLLECTIONS.SUBMISSIONS).countDocuments({
    submissionKind: 'tryon_result',
    $or: [
      { reviewStatus: 'approved', 'tryOnModerationArchive.bucket': { $ne: 'approved' }, 'tryOnModerationArchive.archived': true },
      { reviewStatus: 'rejected', 'tryOnModerationArchive.bucket': { $nin: ['rejected', 'service'] }, 'tryOnModerationArchive.archived': true },
      { 'metadata.tryOnGreat': true, reviewStatus: { $ne: 'approved' } },
    ],
  });

  return apiSuccess({
    garmentCatalogCount: garmentIds.size,
    unknownGarments: {
      resultSubmissions: unknownGarments.resultSubmissions,
      jobs: unknownGarments.jobs,
    },
    identity: {
      placeholderTotal: guestDocs.length,
      sourceRecoverable: sourceRecoverable.length,
      unrecoverable: guestDocs.length - sourceRecoverable.length,
      reviewedUnrecoverable: reviewedUnrecoverable.length,
      unreviewedActionable: unreviewedActionable.length,
    },
    moderationArchive: {
      supersededMissingReason,
    },
    publicationLinks: {
      doneJobsMissingResultSubmission: doneJobsMissingResultsTotal[0]?.total ?? 0,
      samples: doneJobsMissingResults,
    },
    moderation: {
      inconsistentCount: inconsistentModeration,
    },
  });
});
