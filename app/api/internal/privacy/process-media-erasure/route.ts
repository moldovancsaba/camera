import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { ObjectId, type Document } from 'mongodb';
import { apiBadRequest, apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';
import { decryptMediaReferences, type EncryptedMediaReferences } from '@/lib/privacy/erasure';
import { requireCameraPrivacyMediaKey } from '@/lib/privacy/internal';
import { PRIVACY_ERASURE_ACTIVE_FILTER } from '@/lib/privacy/erasure';
import {
  collectMediaReferences,
  createMediaDeleteTasks,
  deleteAndVerifyMediaReference,
  type MediaDeleteTask,
} from '@/lib/privacy/media-erasure';
import { logWarn } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 1;
const TASKS_PER_PHOTO = 3;
const MAX_ATTEMPTS = 10;
const STALE_CLAIM_MS = 15 * 60 * 1_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHOTO_ID = /^[0-9a-f]{24}$/i;
const SHARED_IMAGE_FIELDS = [
  'imageUrl', 'finalImageUrl', 'originalImageUrl', 'previewImageUrl', 'screenImageUrl',
  'photoReview.photoUrl', 'tryOnRequest.sourceImageUrl', 'imageCopies.url',
] as const;

interface ErasureReceipt extends Document {
  _id: ObjectId;
  requestId: string;
  status: string;
  mediaReferences?: EncryptedMediaReferences;
  mediaTasks?: MediaDeleteTask[];
  mediaProcessingAt?: string;
  mediaLeaseToken?: string;
  mediaErasedAt?: string;
}

function authorize(request: Request): void {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  const result = checkSharedSecret(process.env.CRON_SECRET?.trim(), token);
  if (result !== 'ok') {
    if (result !== 'not_configured') logSharedSecretRejection('privacy media erasure worker', 'CRON_SECRET', result);
    throw apiForbidden();
  }
}

function retryDelayMs(attempt: number, refIndex: number): number {
  const exponential = Math.min(6 * 60 * 60_000, 30_000 * (2 ** Math.max(0, attempt - 1)));
  return exponential + ((refIndex * 113) % 5_000);
}

function dueTasks(tasks: MediaDeleteTask[], now: string): MediaDeleteTask[] {
  return tasks.filter((task) =>
    (task.status === 'pending' || task.status === 'retry' || task.status === 'processing')
    && (!task.nextAttemptAt || task.nextAttemptAt <= now)
  ).slice(0, TASKS_PER_PHOTO);
}

function publicSummary(row: ErasureReceipt | null): Document {
  const tasks = row?.mediaTasks ?? [];
  return {
    status: row?.status ?? 'pending',
    pending: tasks.filter((task) => ['pending', 'processing', 'retry'].includes(task.status)).length,
    deleted: tasks.filter((task) => task.status === 'deleted').length,
    alreadyAbsent: tasks.filter((task) => task.status === 'already_absent').length,
    unresolved: tasks.filter((task) => ['unknown', 'failed'].includes(task.status)).length,
  };
}

async function imageReferencedByAnotherLivePhoto(db: Awaited<ReturnType<typeof connectToDatabase>>, photoId: ObjectId, url: string): Promise<boolean> {
  const reference = await db.collection(COLLECTIONS.SUBMISSIONS).findOne({
    $and: [
      PRIVACY_ERASURE_ACTIVE_FILTER,
      { _id: { $ne: photoId }, $or: SHARED_IMAGE_FIELDS.map((field) => ({ [field]: url })) },
    ],
  }, { projection: { _id: 1 } });
  return Boolean(reference);
}

async function processOne(db: Awaited<ReturnType<typeof connectToDatabase>>, nowDate: Date): Promise<Document | null> {
  const receipts = db.collection<ErasureReceipt>(COLLECTIONS.PRIVACY_ERASURE_TOMBSTONES);
  const now = nowDate.toISOString();
  const staleBefore = new Date(nowDate.getTime() - STALE_CLAIM_MS).toISOString();
  const leaseToken = randomUUID();
  const claimed = await receipts.findOneAndUpdate(
    {
      $and: [
        { $or: [
          { status: 'media_pending' },
          { status: 'media_review_required' },
          { status: 'media_processing', mediaProcessingAt: { $lt: staleBefore } },
        ] },
        { $or: [
          { status: 'media_pending', mediaTasks: { $exists: false } },
          { status: 'media_pending', mediaTasks: { $elemMatch: { status: { $in: ['pending', 'retry'] }, nextAttemptAt: { $lte: now } } } },
          { status: 'media_review_required', mediaTasks: { $elemMatch: { status: 'retry', nextAttemptAt: { $lte: now } } } },
          { status: 'media_processing', mediaProcessingAt: { $lt: staleBefore } },
        ] },
        { $or: [{ mediaProcessingAt: { $exists: false } }, { mediaProcessingAt: { $lt: staleBefore } }] },
      ],
    },
    { $set: { status: 'media_processing', mediaProcessingAt: now, mediaLeaseToken: leaseToken, updatedAt: now } },
    { sort: { createdAt: 1, _id: 1 }, returnDocument: 'after' },
  );
  const receipt = claimed?.value;
  if (!receipt) return null;

  try {
    if (!receipt.mediaReferences) {
      await receipts.updateOne(
        { _id: receipt._id, mediaLeaseToken: leaseToken },
        { $set: { status: 'media_review_required', mediaLastErrorCode: 'media_reference_missing', mediaTasks: [], updatedAt: now }, $unset: { mediaProcessingAt: '', mediaLeaseToken: '' } },
      );
      return publicSummary(await receipts.findOne({ _id: receipt._id }));
    }

    const mediaKey = requireCameraPrivacyMediaKey();
    const clearReferences = decryptMediaReferences(receipt.mediaReferences, mediaKey);
    const references = collectMediaReferences(clearReferences, process.env.BLOB_READ_WRITE_TOKEN);
    let tasks: MediaDeleteTask[] = Array.isArray(receipt.mediaTasks) ? receipt.mediaTasks as MediaDeleteTask[] : createMediaDeleteTasks(references, now);
    if (!Array.isArray(receipt.mediaTasks)) {
      await receipts.updateOne({ _id: receipt._id, mediaLeaseToken: leaseToken }, { $set: { mediaTasks: tasks, mediaPlanVersion: 1, updatedAt: now } });
    }

    const due = dueTasks(tasks, now);
    if (!due.length && tasks.length === 0) {
      await receipts.updateOne(
        { _id: receipt._id, mediaLeaseToken: leaseToken },
        { $set: { status: 'media_review_required', mediaLastErrorCode: 'media_reference_missing', mediaTasks: [], updatedAt: now }, $unset: { mediaProcessingAt: '', mediaLeaseToken: '' } },
      );
      return publicSummary(await receipts.findOne({ _id: receipt._id }));
    }

    for (const task of due) {
      task.status = 'processing';
      task.attempt += 1;
      task.processingAt = now;
    }
    tasks = tasks.map((task) => ({ ...task }));
    await receipts.updateOne({ _id: receipt._id, mediaLeaseToken: leaseToken }, { $set: { mediaTasks: tasks, updatedAt: now } });

    const outcomes = await Promise.all(due.map(async (task) => {
      const reference = references[task.refIndex];
      if (!reference) return { task, outcome: { state: 'unknown' as const, errorCode: 'encrypted_reference_missing' } };
      const outcome = await deleteAndVerifyMediaReference(reference, {
        blobToken: process.env.BLOB_READ_WRITE_TOKEN,
        isReferencedElsewhere: (url) => imageReferencedByAnotherLivePhoto(db, receipt._id, url),
      });
      return { task, outcome };
    }));
    const byTask = new Map<string, MediaDeleteTask>(tasks.map((task): [string, MediaDeleteTask] => [task.taskId, task]));
    const nowAfter = new Date().toISOString();
    for (const { task: claimedTask, outcome } of outcomes) {
      const task = byTask.get(claimedTask.taskId);
      if (!task) continue;
      delete task.processingAt;
      if (outcome.state === 'deleted' || outcome.state === 'already_absent') {
        task.status = outcome.state;
        delete task.lastErrorCode;
        continue;
      }
      task.lastErrorCode = outcome.errorCode;
      if (outcome.state === 'unknown') {
        task.status = 'unknown';
      } else if (task.attempt >= MAX_ATTEMPTS) {
        task.status = 'failed';
      } else {
        task.status = 'retry';
        task.nextAttemptAt = new Date(Date.parse(nowAfter) + retryDelayMs(task.attempt, task.refIndex)).toISOString();
      }
    }
    const unresolved = tasks.some((task) => task.status === 'unknown');
    const exhausted = tasks.some((task) => task.status === 'failed');
    const complete = tasks.every((task) => task.status === 'deleted' || task.status === 'already_absent');
    const nextStatus = unresolved ? 'media_review_required' : exhausted ? 'media_failed' : complete ? 'media_erased' : 'media_pending';
    await receipts.updateOne(
      { _id: receipt._id, status: 'media_processing', mediaLeaseToken: leaseToken },
      {
        $set: {
          status: nextStatus,
          mediaTasks: tasks,
          updatedAt: nowAfter,
          ...(complete ? { mediaErasedAt: nowAfter } : {}),
        },
        $unset: { mediaProcessingAt: '', mediaLeaseToken: '', ...(complete ? { mediaReferences: '' } : {}) },
      },
    );
    if (unresolved || exhausted) {
      logWarn('privacy.camera_erasure.media_unresolved', 'A provider media deletion needs recovery and the erasure remains incomplete', {
        requestRef: String(receipt.requestId ?? '').slice(-8),
        photoRef: receipt._id.toHexString().slice(-8),
        errorCode: unresolved ? 'media_reference_unresolved' : 'provider_retry_limit_reached',
        unresolvedCount: tasks.filter((task) => task.status === 'unknown' || task.status === 'failed').length,
      });
    }
    return publicSummary(await receipts.findOne({ _id: receipt._id }));
  } catch (error) {
    const latest = await receipts.findOne({ _id: receipt._id, mediaLeaseToken: leaseToken }, { projection: { mediaTasks: 1 } });
    const retryAt = new Date().toISOString();
    const recoveredTasks = ((latest?.mediaTasks ?? []) as MediaDeleteTask[]).map((task) => task.status === 'processing'
      ? { ...task, status: 'retry' as const, nextAttemptAt: retryAt, processingAt: undefined, lastErrorCode: 'worker_failed' }
      : task);
    await receipts.updateOne(
      { _id: receipt._id, status: 'media_processing', mediaLeaseToken: leaseToken },
      { $set: { status: 'media_pending', mediaTasks: recoveredTasks, mediaLastErrorCode: 'worker_failed', updatedAt: retryAt }, $unset: { mediaProcessingAt: '', mediaLeaseToken: '' } },
    );
    logWarn('privacy.camera_erasure.media_worker_failed', 'The provider media cleanup could not finish; the receipt stays pending for retry', {
      requestRef: String(receipt.requestId ?? '').slice(-8),
      photoRef: receipt._id.toHexString().slice(-8),
      errorCode: error instanceof Error && error.message === 'Unsupported media reference envelope' ? 'media_envelope_unsupported' : 'media_worker_failed',
    });
    return { status: 'media_pending', pending: 0, deleted: 0, alreadyAbsent: 0, unresolved: 0 };
  }
}

const processHandler = withErrorHandler(async (request: NextRequest) => {
  authorize(request);
  const db = await connectToDatabase();
  const now = new Date();
  let processed = 0;
  const statuses: Document[] = [];
  for (let index = 0; index < BATCH_SIZE; index += 1) {
    const result = await processOne(db, now);
    if (!result) break;
    processed += 1;
    statuses.push(result);
  }
  return apiSuccess({ version: 1, processed, photos: statuses });
});

const retryHandler = withErrorHandler(async (request: NextRequest) => {
  authorize(request);
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw apiBadRequest('Content-Type must be application/json');
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > 4_096) throw apiBadRequest('Request body is too large');
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > 4_096) throw apiBadRequest('Request body is too large');
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw apiBadRequest('A valid JSON body is required'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw apiBadRequest('A JSON object is required');
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some((key) => !['request_id', 'photo_id'].includes(key))) throw apiBadRequest('Only request_id and photo_id are supported');
  const requestId = typeof value.request_id === 'string' ? value.request_id.trim() : '';
  const photoId = typeof value.photo_id === 'string' ? value.photo_id.trim().toLowerCase() : '';
  if (!UUID.test(requestId) || !PHOTO_ID.test(photoId)) throw apiBadRequest('A valid request_id and photo_id are required');

  const db = await connectToDatabase();
  const receipts = db.collection<ErasureReceipt>(COLLECTIONS.PRIVACY_ERASURE_TOMBSTONES);
  const _id = new ObjectId(photoId);
  const receipt = await receipts.findOne({ _id, requestId }, { projection: { status: 1, mediaTasks: 1 } });
  if (!receipt || !['media_failed', 'media_review_required'].includes(receipt.status)) throw apiBadRequest('This media erasure is not awaiting manual recovery');
  if (!Array.isArray(receipt.mediaTasks) || receipt.mediaTasks.length === 0) throw apiBadRequest('No provider references are available to retry; the media target requires source recovery or a documented exception');
  const tasks = ((receipt.mediaTasks ?? []) as MediaDeleteTask[]).map((task) => ['failed', 'unknown', 'processing'].includes(task.status)
    ? { ...task, status: 'pending' as const, attempt: 0, nextAttemptAt: new Date().toISOString(), lastErrorCode: undefined, processingAt: undefined }
    : task);
  await receipts.updateOne(
    { _id, requestId, status: receipt.status },
    { $set: { status: 'media_pending', mediaTasks: tasks, updatedAt: new Date().toISOString() }, $unset: { mediaLastErrorCode: '', mediaProcessingAt: '', mediaLeaseToken: '' } },
  );
  return apiSuccess({ version: 1, request_id: requestId, photo_id: photoId, status: 'media_pending', pending: tasks.filter((task) => ['pending', 'processing', 'retry'].includes(task.status)).length });
});

export const GET = processHandler;
export const POST = retryHandler;
