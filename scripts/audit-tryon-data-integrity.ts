import { ObjectId } from 'mongodb';
import { loadEnvFromFiles } from './load-env-from-files';
import { connectToDatabase, closeConnection } from '@/lib/db/mongodb';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { isTryOnPlaceholderEmail } from '@/lib/tryon/identity';

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

async function main() {
  loadEnvFromFiles();
  const strict = process.argv.includes('--strict');
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
  const requestGarments = await db.collection(COLLECTIONS.SUBMISSIONS).aggregate([
    { $match: { 'tryOnRequest.leatherSuitId': { $type: 'string' } } },
    { $group: { _id: '$tryOnRequest.leatherSuitId', count: { $sum: 1 } } },
  ]).toArray();
  const embeddedGarments = await db.collection(COLLECTIONS.SUBMISSIONS).aggregate([
    { $unwind: '$tryOnJobs' },
    { $group: { _id: '$tryOnJobs.leatherSuitId', count: { $sum: 1 } } },
  ]).toArray();
  const unknownGarments = {
    resultSubmissions: resultGarments.filter((row) => row._id && !garmentIds.has(row._id)),
    jobs: jobGarments.filter((row) => row._id && !garmentIds.has(row._id)),
    tryOnRequest: requestGarments.filter((row) => row._id && !garmentIds.has(row._id)),
    embeddedTryOnJobs: embeddedGarments.filter((row) => row._id && !garmentIds.has(row._id)),
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
  const doneJobsMissingResults = await db.collection(COLLECTIONS.TRYON_JOBS).aggregate([
    { $match: { status: 'done' } },
    { $lookup: { from: COLLECTIONS.SUBMISSIONS, localField: 'jobId', foreignField: 'sourceJobId', as: 'result' } },
    { $match: { result: { $size: 0 } } },
    { $project: { _id: 0, jobId: 1, createdAt: 1, updatedAt: 1, resultUrl: '$result.publicResultUrl' } },
    { $limit: 100 },
  ]).toArray();
  const inconsistentModeration = await db.collection(COLLECTIONS.SUBMISSIONS).find({
    submissionKind: 'tryon_result',
    $or: [
      { reviewStatus: 'approved', 'tryOnModerationArchive.bucket': { $ne: 'approved' }, 'tryOnModerationArchive.archived': true },
      { reviewStatus: 'rejected', 'tryOnModerationArchive.bucket': { $nin: ['rejected', 'service'] }, 'tryOnModerationArchive.archived': true },
      { 'metadata.tryOnGreat': true, reviewStatus: { $ne: 'approved' } },
    ],
  }, { projection: { _id: 1, reviewStatus: 1, tryOnModerationArchive: 1, metadata: 1 } }).limit(100).toArray();
  const summary = {
    garmentCatalogCount: garmentIds.size,
    unknownGarments,
    identity: {
      placeholderTotal: guestDocs.length,
      sourceRecoverable: sourceRecoverable.length,
      unrecoverable: guestDocs.length - sourceRecoverable.length,
    },
    publicationLinks: {
      doneJobsMissingResultSubmission: doneJobsMissingResults.length,
      samples: doneJobsMissingResults,
    },
    moderation: {
      inconsistentCount: inconsistentModeration.length,
      samples: inconsistentModeration,
    },
  };
  console.log(JSON.stringify(summary, null, 2));
  const hasFailures =
    Object.values(unknownGarments).some((rows) => rows.length > 0) ||
    sourceRecoverable.length > 0 ||
    doneJobsMissingResults.length > 0 ||
    inconsistentModeration.length > 0;
  if (strict && hasFailures) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeConnection();
  });
