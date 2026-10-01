import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiNotFound, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type TryOnJob } from '@/lib/db/schemas';
import { assertImageDirectCallbackSecret, applyTryOnCompletion } from '@/lib/tryon/completion';
import { readBoundedRequestJson, validateImageDirectCompletion } from '@/lib/tryon/image-direct-callback';

export const runtime = 'nodejs';

const handlePost = withErrorHandler(async (request: NextRequest) => {
  assertImageDirectCallbackSecret(request);
  if (process.env.CAMERA_IMAGE_DIRECT_CALLBACK_ENABLED !== 'true') {
    return NextResponse.json({ error: 'integration_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'invalid_callback' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  const parsed = await readBoundedRequestJson(request, 16 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? 'request_too_large' : 'invalid_callback' }, { status: parsed.status, headers: { 'Cache-Control': 'no-store' } });
  const validation = validateImageDirectCompletion(parsed.value);
  if (!validation.ok) {
    const status = validation.code === 'host_not_configured' ? 503 : validation.code === 'result_host_rejected' ? 400 : 400;
    return NextResponse.json({ error: validation.code }, { status, headers: { 'Cache-Control': 'no-store' } });
  }

  const callback = validation.payload;
  const db = await connectToDatabase();
  const jobs = db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS);
  const job = await jobs.findOne({ jobId: callback.jobId });
  if (!job) throw apiNotFound('Try-on job');
  if (job.renderer !== 'image_direct' || job.imageDirect?.executionId !== callback.executionId) {
    return NextResponse.json({ error: 'job_correlation_mismatch' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
  }
  if (job.status === 'cancelled' || job.status === 'failed') {
    return NextResponse.json({ error: 'job_terminal' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
  }

  const resultSnapshot = {
    idempotencyKey: callback.idempotencyKey,
    publicResultUrl: callback.publicResultUrl,
    sha256: callback.sha256,
    byteLength: callback.byteLength,
    mediaType: callback.mediaType,
    pipelineVersion: callback.processorMeta.pipelineVersion,
    modelId: callback.processorMeta.modelId,
  } as const;
  if (job.imageDirect.result) {
    if (Object.keys(resultSnapshot).some((key) => job.imageDirect?.result?.[key as keyof typeof resultSnapshot] !== resultSnapshot[key as keyof typeof resultSnapshot])) {
      return NextResponse.json({ error: 'result_conflict' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }
  } else {
    await jobs.updateOne(
      { jobId: callback.jobId, renderer: 'image_direct', 'imageDirect.executionId': callback.executionId, 'imageDirect.result': { $exists: false } },
      { $set: { 'imageDirect.result': resultSnapshot, updatedAt: new Date().toISOString() } },
    );
    const latest = await jobs.findOne({ jobId: callback.jobId });
    if (!latest) throw apiNotFound('Try-on job');
    if (latest.renderer !== 'image_direct' || latest.imageDirect?.executionId !== callback.executionId || !latest.imageDirect.result ||
        Object.keys(resultSnapshot).some((key) => latest.imageDirect?.result?.[key as keyof typeof resultSnapshot] !== resultSnapshot[key as keyof typeof resultSnapshot])) {
      return NextResponse.json({ error: 'result_conflict' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }
  }

  const result = await applyTryOnCompletion(db, job, {
    publicResultUrl: callback.publicResultUrl,
    workerId: callback.workerId,
    pipelineVersion: callback.processorMeta.pipelineVersion,
    forcePendingReview: true,
  });
  const response = apiSuccess({
    schemaVersion: 1,
    jobId: callback.jobId,
    executionId: callback.executionId,
    sourceSubmissionId: result.sourceSubmissionId,
    resultSubmissionId: result.resultSubmissionId,
    publicationStatus: result.publicationStatus,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
});

export async function POST(request: NextRequest) {
  const response = await handlePost(request);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
