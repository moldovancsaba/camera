import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type Submission, type TryOnJob } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { normalizeImgbbDirectUrl } from '@/lib/imgbb/url';

function normalizeDisplayName(value?: string | null): string {
  if (typeof value === 'string' && value.trim() && value.trim().toLowerCase() !== 'event guest') {
    return value.trim();
  }
  return 'Guest';
}

function toSetupPayload(job: TryOnJob | null | undefined) {
  if (typeof job?.processing?.resolvedSetup?.setupId === 'string' && job.processing.resolvedSetup.setupId.trim()) {
    return {
      setupId: job.processing.resolvedSetup.setupId,
      setupName:
        typeof job.processing.resolvedSetup.setupName === 'string'
          ? job.processing.resolvedSetup.setupName
          : null,
      setupProfile:
        typeof job.processing.resolvedSetup.setupProfile === 'string'
          ? job.processing.resolvedSetup.setupProfile
          : null,
      setupSource:
        typeof job.processing.resolvedSetup.setupSource === 'string'
          ? job.processing.resolvedSetup.setupSource
          : null,
    };
  }

  if (typeof job?.request?.setupId === 'string' && job.request.setupId.trim()) {
    return {
      setupId: job.request.setupId.trim(),
      setupName: null,
      setupProfile: null,
      setupSource: null,
    };
  }

  return null;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) {
    throw apiForbidden('Global admin access is required');
  }

  const { searchParams } = request.nextUrl;
  const reviewStatus = searchParams.get('reviewStatus')?.trim();
  const archive = searchParams.get('archive')?.trim();
  const eventId = searchParams.get('eventId')?.trim();
  const partnerId = searchParams.get('partnerId')?.trim();
  const suitId = searchParams.get('suitId')?.trim();
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.max(1, Math.min(100, Number.parseInt(searchParams.get('limit') || '50', 10) || 50));

  const query: Record<string, unknown> = {
    submissionKind: 'tryon_result',
  };

  if (archive === 'approved' || archive === 'rejected') {
    query['tryOnModerationArchive.archived'] = true;
    query['tryOnModerationArchive.bucket'] = archive;
  } else {
    query['tryOnModerationArchive.archived'] = { $ne: true };
    query.reviewStatus = reviewStatus || 'pending_review';
  }

  if ((archive === 'approved' || archive === 'rejected') && reviewStatus) {
    query.reviewStatus = reviewStatus;
  }
  if (eventId) {
    query.$or = [{ eventId }, { eventIds: { $in: [eventId] } }];
  }
  if (partnerId) {
    query.partnerId = partnerId;
  }
  if (suitId) {
    query.tryOnLeatherSuitId = suitId;
  }

  const db = await connectToDatabase();
  const total = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments(query);
  const docs = (await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
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

  const sourceJobIds = Array.from(new Set(
    docs
      .map((doc) => doc.sourceJobId)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  ));
  const sourceJobMap = new Map<string, TryOnJob>();
  if (sourceJobIds.length > 0) {
    const sourceJobs = await db
      .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
      .find({ jobId: { $in: sourceJobIds } })
      .toArray();
    for (const sourceJob of sourceJobs) {
      sourceJobMap.set(sourceJob.jobId, sourceJob);
    }
  }

  return apiSuccess({
    results: docs.map((doc) => {
      const source = doc.sourceSubmissionId ? sourceMap.get(doc.sourceSubmissionId) : null;
      const sourceJob = doc.sourceJobId ? sourceJobMap.get(doc.sourceJobId) : null;
      return {
        id: doc._id.toString(),
        sourceSubmissionId: doc.sourceSubmissionId ?? null,
        sourceJobId: doc.sourceJobId ?? null,
        setup: toSetupPayload(sourceJob),
        reviewStatus: doc.reviewStatus ?? 'pending_review',
        imageUrl:
          normalizeImgbbDirectUrl(doc.finalImageUrl ?? null) ??
          normalizeImgbbDirectUrl(doc.imageUrl ?? null) ??
          '',
        originalImageUrl:
          normalizeImgbbDirectUrl(source?.imageUrl ?? null) ??
          normalizeImgbbDirectUrl(source?.finalImageUrl ?? null),
        userName: normalizeDisplayName(doc.userName),
        userEmail: doc.userEmail ?? '',
        eventName: doc.eventName ?? null,
        partnerName: doc.partnerName ?? null,
        tryOnLeatherSuitId: doc.tryOnLeatherSuitId ?? null,
        createdAt: doc.createdAt,
        approvedAt: doc.approvedAt ?? null,
        isShareVisible: Boolean(doc.isShareVisible),
        isSlideshowEligible: Boolean(doc.isSlideshowEligible),
        isGreat: Boolean(doc.metadata?.tryOnGreat),
      };
    }),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});
