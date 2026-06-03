import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiCreated, apiNotFound, apiSuccess, withErrorHandler } from '@/lib/api';
import {
  assertInternalTryOnSecret,
  applyTryOnCompletion,
  type TryOnCompletionResult,
} from '@/lib/tryon/completion';
import { COLLECTIONS, type TryOnJob } from '@/lib/db/schemas';

interface CompletionPayload {
  jobId?: string;
  publicResultUrl?: string;
  deleteUrl?: string | null;
  workerId?: string | null;
  processorMeta?: {
    pipelineVersion?: string | null;
  };
}

function toApiResponse(payload: {
  result: TryOnCompletionResult;
  sourceSubmissionId: string;
  jobId: string;
}) {
  return {
    jobId: payload.jobId,
    sourceSubmissionId: payload.sourceSubmissionId,
    resultSubmissionId: payload.result.resultSubmissionId,
    publicationStatus: payload.result.publicationStatus,
  };
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  assertInternalTryOnSecret(request);
  const body = (await request.json()) as CompletionPayload;
  const jobId = body.jobId?.trim();
  const publicResultUrl = body.publicResultUrl?.trim();

  if (!jobId) {
    throw apiBadRequest('jobId is required');
  }
  if (!publicResultUrl) {
    throw apiBadRequest('publicResultUrl is required');
  }

  const db = await connectToDatabase();
  const job = await db
    .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
    .findOne({ jobId });
  if (!job) {
    throw apiNotFound('Try-on job');
  }

  const result = await applyTryOnCompletion(db, job, {
    publicResultUrl,
    deleteUrl: body.deleteUrl ?? null,
    workerId: body.workerId ?? null,
    pipelineVersion: body.processorMeta?.pipelineVersion ?? null,
  });

  const response = toApiResponse({
    result,
    sourceSubmissionId: result.sourceSubmissionId,
    jobId,
  });

  if (result.action === 'created') {
    return apiCreated(response);
  }

  return apiSuccess(response);
});

export const GET = withErrorHandler(async (_request: NextRequest) => {
  throw apiBadRequest('Try-on completion endpoint requires POST');
});
