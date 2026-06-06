import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type TryOnJob } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';

function toQueueRow(job: Partial<TryOnJob>) {
  return {
    jobId: typeof job.jobId === 'string' ? job.jobId : '',
    status: typeof job.status === 'string' ? job.status : '',
    stage: typeof job.stage === 'string' ? job.stage : '',
    createdAt: typeof job.createdAt === 'string' ? job.createdAt : '',
    source: {
      submissionId: typeof job.source?.submissionId === 'string' ? job.source.submissionId : 'unknown',
      imageUrl: typeof job.source?.imageUrl === 'string' ? job.source.imageUrl : '',
      eventMongoId: typeof job.source?.eventMongoId === 'string' ? job.source.eventMongoId : null,
    },
    request: {
      leatherSuitId: typeof job.request?.leatherSuitId === 'string' ? job.request.leatherSuitId : 'unknown',
      setupId:
        typeof job.request?.setupId === 'string' && job.request.setupId.trim().length > 0
          ? job.request.setupId
          : null,
    },
    processing: {
      workerId: typeof job.processing?.workerId === 'string' ? job.processing.workerId : null,
      attemptCount:
        typeof job.processing?.attemptCount === 'number' && Number.isFinite(job.processing.attemptCount)
          ? job.processing.attemptCount
          : 0,
      nextAttemptAt: typeof job.processing?.nextAttemptAt === 'string' ? job.processing.nextAttemptAt : null,
      resolvedSetup:
        typeof job.processing?.resolvedSetup?.setupId === 'string' &&
        typeof job.processing.resolvedSetup.setupName === 'string'
          ? {
              setupId: job.processing.resolvedSetup.setupId,
              setupName: job.processing.resolvedSetup.setupName,
            }
          : undefined,
    },
    result: {
      publicResultUrl: typeof job.result?.publicResultUrl === 'string' ? job.result.publicResultUrl : null,
    },
    error: {
      code: typeof job.error?.code === 'string' ? job.error.code : null,
      message: typeof job.error?.message === 'string' ? job.error.message : null,
    },
  };
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) {
    throw apiForbidden('Global admin access is required');
  }

  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status')?.trim();
  const search = searchParams.get('search')?.trim();
  const offset = Math.max(0, Number.parseInt(searchParams.get('offset') || '0', 10) || 0);
  const limit = Math.max(1, Math.min(100, Number.parseInt(searchParams.get('limit') || '100', 10) || 100));

  const query: Record<string, unknown> = {};
  if (status) {
    query.status = status;
  }
  if (search) {
    query.$or = [
      { jobId: { $regex: search, $options: 'i' } },
      { 'source.submissionId': { $regex: search, $options: 'i' } },
      { 'request.leatherSuitId': { $regex: search, $options: 'i' } },
      { 'request.setupId': { $regex: search, $options: 'i' } },
      { 'source.imageUrl': { $regex: search, $options: 'i' } },
    ];
  }

  const db = await connectToDatabase();
  const [jobs, total] = await Promise.all([
    db
      .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
      .find(query)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray(),
    db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).countDocuments(query),
  ]);

  return apiSuccess({
    jobs: jobs.map(toQueueRow),
    pagination: {
      offset,
      limit,
      total,
      loaded: Math.min(offset + jobs.length, total),
      hasMore: offset + jobs.length < total,
    },
  });
});
