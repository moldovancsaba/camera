/** Temporary Preview-only Hetzner smoke test. Remove after the authorized check. */

import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';
import { CameraModerationClient, ModerationServiceError, moderationConfiguration } from '@/lib/photo-moderation/client';
import { MODERATION_CATEGORIES, parseCameraModerationResult } from '@/lib/photo-moderation/contract';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TEST_EVENT_ID = '6ad77472c1f0642d86070825';
const MAX_BASE64_LENGTH = 5_600_000;
const POLL_INTERVAL_MS = 1_500;
const POLL_BUDGET_MS = 45_000;

const handler = withErrorHandler(async (request: NextRequest) => {
  if (process.env.VERCEL_ENV !== 'preview' || request.headers.get('x-request-purpose') !== 'test') throw apiForbidden();
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  const auth = checkSharedSecret(process.env.CRON_SECRET?.trim(), token);
  if (auth !== 'ok') {
    if (auth !== 'not_configured') logSharedSecretRejection('photo moderation diagnostic', 'CRON_SECRET', auth);
    throw apiForbidden();
  }
  if (!request.nextUrl.searchParams.has('eventMongoId') || request.nextUrl.searchParams.get('eventMongoId') !== TEST_EVENT_ID) throw apiForbidden();

  const configuration = moderationConfiguration();
  if (!configuration) throw new ModerationServiceError('moderation_not_configured', null);
  const body = await request.json().catch(() => null) as { image_base64?: unknown; discover_only?: unknown } | null;
  const encoded = body?.image_base64;
  if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > MAX_BASE64_LENGTH || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw apiBadRequest('A base64 test image is required.');
  }
  const image = Buffer.from(encoded, 'base64');
  if (!image.length || image.length > 4 * 1024 * 1024 || image.toString('base64') !== encoded) throw apiBadRequest('The test image is invalid or too large.');

  const db = await connectToDatabase();
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(TEST_EVENT_ID) }, { projection: { eventId: 1, isActive: 1, photoVetting: 1, photoModerationPrecheck: 1 } });
  if (!event) return apiNotFound('Test event');
  if (event.isActive !== true || (event.photoVetting as { required?: unknown } | undefined)?.required !== true || (event.photoModerationPrecheck as { enabled?: unknown } | undefined)?.enabled !== true) {
    throw apiForbidden();
  }
  const eventId = typeof event.eventId === 'string' ? event.eventId : '';
  if (!eventId || await db.collection(COLLECTIONS.SUBMISSIONS).countDocuments({ eventId }) !== 0) throw apiForbidden();

  if (body?.discover_only === true) {
    const headers = { Authorization: `Bearer ${configuration.apiKey}`, 'X-Request-Purpose': 'test' };
    const [taskResponse, modelResponse] = await Promise.all([
      fetch(`${configuration.baseUrl}/job-types`, { headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) }),
      fetch(`${configuration.baseUrl}/models`, { headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) }),
    ]);
    const taskBody = await taskResponse.json().catch(() => null) as Record<string, unknown> | null;
    const modelBody = await modelResponse.json().catch(() => null) as Record<string, unknown> | null;
    const modelList = Array.isArray(modelBody?.models) ? modelBody.models : null;
    return apiSuccess({
      taskStatus: taskResponse.status,
      taskResponseKeys: taskBody ? Object.keys(taskBody) : [],
      allowedTaskNames: taskBody?.job_types && typeof taskBody.job_types === 'object' ? Object.keys(taskBody.job_types) : [],
      modelsStatus: modelResponse.status,
      modelsResponseKeys: modelBody ? Object.keys(modelBody) : [],
      modelsPropertyType: Array.isArray(modelBody?.models) ? 'array' : typeof modelBody?.models,
      modelCount: modelList?.length ?? null,
      modelSummary: modelList?.map((raw) => {
        const model = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
        return { id: model.id ?? null, selectable_for: model.selectable_for ?? null, default_for: model.default_for ?? null, blocked_reason: model.blocked_reason ?? null };
      }) ?? [],
      defaults: modelBody?.defaults ?? null,
    });
  }

  const client = new CameraModerationClient(configuration);
  await client.discover(); // GET /job-types and GET /models; rejects unavailable task/model inventories.
  // Repeated Preview invocations reconcile this exact smoke job instead of
  // enqueueing another image when inference outlasts one function invocation.
  const idempotencyKey = `preview-smoke-${createHash('sha256').update(image).digest('hex')}`;
  const jobId = await client.submit(image, idempotencyKey);
  const deadline = Date.now() + POLL_BUDGET_MS;
  let terminal = false;
  let result: ReturnType<typeof parseCameraModerationResult> = null;
  let deleteSucceeded = false;
  try {
    while (Date.now() < deadline) {
      const job = await client.read(jobId);
      if (job.status === 'failed') {
        terminal = true;
        throw new ModerationServiceError('test_job_failed', null);
      }
      if (job.status === 'completed') {
        terminal = true;
        result = parseCameraModerationResult(job.result);
        if (!result) throw new ModerationServiceError('test_result_invalid', null);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    if (!terminal) return apiSuccess({ status: 'running', retryWithSameImage: true, remoteJobDeleted: false }, 202);
    if (!result) throw new ModerationServiceError('test_result_invalid', null);
  } finally {
    if (terminal) {
      try {
        await client.delete(jobId);
        deleteSucceeded = true;
      } catch {
        // Return only cleanup status; the provider's remote result TTL is five minutes.
      }
    }
  }

  return apiSuccess({
    taskAndModelDiscovery: 'passed',
    resolvedModel: result.model,
    expectedDefaultMatches: result.model.toLowerCase() === 'qwen3.5:0.8b',
    signal: result.signal,
    flags: result.flags,
    categories: result.categories,
    categoryCount: MODERATION_CATEGORIES.length,
    review_required: result.review_required,
    automated_decision: result.automated_decision,
    inferenceSeconds: result.timing?.inference_seconds ?? null,
    remoteJobDeleted: deleteSucceeded,
  });
});

export const POST = handler;
