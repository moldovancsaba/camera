import { randomUUID } from 'node:crypto';
import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { hasVerifiableConsentAudit } from '@/lib/events/consent-eligibility';
import { guestContactOf } from '@/lib/submissions/guest-contact';
import { PRIVACY_ERASURE_ACTIVE_FILTER, privacyErasureIsFenced } from '@/lib/privacy/erasure';
import { logInfo, logWarn } from '@/lib/observability/logger';
import { CameraModerationClient, isCameraPendingPhotoUrl, loadModerationImage, ModerationServiceError, moderationConfiguration, type NormalizedModerationImage, type RemoteModerationJob } from './client';
import { parseCameraModerationResult } from './contract';

export const MODERATION_WORKER_LOCK_ID = 'camera-photo-moderation-precheck-worker';
export const MODERATION_WORKER_MAX_BATCH = 10;
export const MODERATION_WORKER_BUDGET_MS = 42_000;
export const MODERATION_POLL_MS = 2_500;
export const MODERATION_MAX_ATTEMPTS = 5;
export const MODERATION_REMOTE_MAX_AGE_MS = 330_000;

interface PrecheckState extends Document {
  enabledAtCapture?: true;
  status?: string;
  photoUrl?: string;
  eventMongoId?: string;
  sourceRevision?: string;
  normalizedRevision?: string;
  idempotencyKey?: string;
  jobId?: string;
  queuedAt?: string;
  startedAt?: string;
  attempts?: number;
  nextAttemptAt?: string;
  lastErrorCode?: string;
}

interface WorkerSubmission extends Document {
  eventId?: string;
  reviewStatus?: string;
  consentStatus?: string;
  consents?: unknown;
  guestContact?: unknown;
  retentionStatus?: string;
  isArchived?: boolean;
  photoReview?: { photoUrl?: unknown } | null;
  moderationPrecheck?: PrecheckState;
  privacyErasure?: unknown;
}

interface ModerationClient {
  discover(): Promise<void>;
  submit(image: Buffer, idempotencyKey: string, signal?: AbortSignal): Promise<string>;
  read(jobId: string, signal?: AbortSignal): Promise<RemoteModerationJob>;
  delete(jobId: string, signal?: AbortSignal): Promise<void>;
}

type ModerationImageLoader = (url: string, eventMongoId: string) => Promise<NormalizedModerationImage>;

export interface ModerationWorkerResult {
  status: 'processed' | 'busy' | 'not_configured' | 'discovery_failed';
  submitted: number;
  completed: number;
  flagged: number;
  uncertain: number;
  failed: number;
  waiting: number;
}

const EVENT_STATES = ['queued', 'submitting', 'queued_remote', 'running'] as const;
const dateNow = () => new Date().toISOString();
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const stateOf = (row: WorkerSubmission): PrecheckState => isRecord(row.moderationPrecheck) ? row.moderationPrecheck as PrecheckState : {};
/** Every check is repeated before the remote call and before any response is stored. */
export function moderationSourceEligible(row: WorkerSubmission, expectedUrl?: string): boolean {
  const precheck = stateOf(row);
  const contact = guestContactOf(row);
  const sourceUrl = typeof row.photoReview?.photoUrl === 'string' ? row.photoReview.photoUrl : null;
  return precheck.enabledAtCapture === true
    && typeof sourceUrl === 'string'
    && sourceUrl.length > 0
    && precheck.photoUrl === sourceUrl
    && (expectedUrl === undefined || expectedUrl === sourceUrl)
    && row.reviewStatus === 'pending_review'
    && row.consentStatus === 'received'
    && hasVerifiableConsentAudit(row.consents)
    && contact.status === 'complete'
    && Boolean(contact.email)
    && !['pending_erasure', 'erasing', 'erased'].includes(String(row.retentionStatus ?? ''))
    && row.isArchived !== true
    && !privacyErasureIsFenced(row.privacyErasure);
}

function baseEligibleMongoFilter(): Document {
  return {
    'moderationPrecheck.enabledAtCapture': true,
    'moderationPrecheck.status': { $in: [...EVENT_STATES] },
    reviewStatus: 'pending_review',
    consentStatus: 'received',
    'guestContact.status': 'complete',
    'guestContact.email': { $type: 'string', $ne: '' },
    'photoReview.photoUrl': { $type: 'string', $ne: '' },
    retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] },
    isArchived: { $ne: true },
    ...PRIVACY_ERASURE_ACTIVE_FILTER,
  };
}

function dueWorkQuery(now: string): Document {
  return {
    ...baseEligibleMongoFilter(),
    $or: [
      {
        'moderationPrecheck.status': { $in: ['queued', 'submitting'] },
        $or: [
          { 'moderationPrecheck.nextAttemptAt': { $exists: false } },
          { 'moderationPrecheck.nextAttemptAt': { $lte: now } },
        ],
      },
      { 'moderationPrecheck.status': { $in: ['queued_remote', 'running'] }, 'moderationPrecheck.jobId': { $type: 'string' } },
    ],
  };
}

function remoteWorkQuery(jobId: string): Document {
  return { 'moderationPrecheck.jobId': jobId, 'moderationPrecheck.status': { $in: ['queued_remote', 'running'] } };
}

function responseFilter(row: WorkerSubmission): Document {
  const precheck = stateOf(row);
  return {
    _id: row._id,
    'moderationPrecheck.enabledAtCapture': true,
    'moderationPrecheck.photoUrl': precheck.photoUrl,
    'moderationPrecheck.status': { $in: [...EVENT_STATES] },
    ...(typeof precheck.sourceRevision === 'string' ? { 'moderationPrecheck.sourceRevision': precheck.sourceRevision } : {}),
    ...(typeof precheck.normalizedRevision === 'string' ? { 'moderationPrecheck.normalizedRevision': precheck.normalizedRevision } : {}),
    ...(typeof precheck.jobId === 'string' ? { 'moderationPrecheck.jobId': precheck.jobId } : {}),
    ...(typeof precheck.idempotencyKey === 'string' ? { 'moderationPrecheck.idempotencyKey': precheck.idempotencyKey } : {}),
    reviewStatus: 'pending_review',
    consentStatus: 'received',
    'guestContact.status': 'complete',
    'photoReview.photoUrl': precheck.photoUrl,
    retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] },
    isArchived: { $ne: true },
    ...PRIVACY_ERASURE_ACTIVE_FILTER,
  };
}

function retryTime(attempts: number, retryAfterSeconds?: number): string {
  const backoff = Math.min(15 * 60, 30 * 2 ** Math.max(0, attempts - 1));
  const seconds = Math.max(backoff, retryAfterSeconds ?? 0);
  return new Date(Date.now() + seconds * 1_000).toISOString();
}

function retryableServiceError(error: ModerationServiceError): boolean {
  return error.status === null || error.status === 404 || error.status === 429 || (error.status !== null && error.status >= 500);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Best-effort remote cleanup runs only after a terminal job is consumed locally. */
async function deleteConsumedRemoteJob(client: ModerationClient, jobId: string): Promise<void> {
  try {
    await client.delete(jobId, AbortSignal.timeout(8_000));
  } catch (error) {
    const code = error instanceof ModerationServiceError ? error.code : 'remote_delete_failed';
    logWarn('camera.photo_moderation.remote_delete_failed', 'A consumed remote result could not be deleted; the provider five-minute expiry remains the fallback', {
      errorCode: code.slice(0, 80),
      jobRef: jobId.slice(-8),
    });
  }
}

async function safeUpdate(db: Db, row: WorkerSubmission, set: Document, unset: Document = {}): Promise<boolean> {
  const update: Document = { $set: { ...set, updatedAt: dateNow() } };
  if (Object.keys(unset).length) update.$unset = unset;
  const result = await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(responseFilter(row), update);
  return result.modifiedCount === 1;
}

function makeIdempotencyKey(submissionId: string, sourceRevision: string, generation: number): string {
  const base = `camera-${submissionId}-${sourceRevision.slice(0, 40)}`;
  return generation > 1 ? `${base}-r${generation}` : base;
}

async function acquireGlobalLease(db: Db, now: string, token: string): Promise<Document | null> {
  try {
    const claimed = await db.collection<{ _id: string; [key: string]: unknown }>(COLLECTIONS.ADMIN_SETTINGS).findOneAndUpdate(
      {
        _id: MODERATION_WORKER_LOCK_ID,
        $or: [{ leaseUntil: { $lte: now } }, { leaseUntil: { $exists: false } }],
      },
      { $set: { leaseToken: token, leaseUntil: new Date(Date.now() + 55_000).toISOString(), updatedAt: now } },
      // mongodb v6 returns the document directly by default, not `{ value }`.
      { upsert: true, returnDocument: 'after', includeResultMetadata: false },
    );
    return claimed ?? null;
  } catch (error) {
    if (isRecord(error) && error.code === 11000) return null;
    throw error;
  }
}

async function setWorkerLock(db: Db, leaseToken: string, set: Document, unset: Document = {}): Promise<void> {
  const update: Document = { $set: set };
  if (Object.keys(unset).length) update.$unset = unset;
  await db.collection<{ _id: string; [key: string]: unknown }>(COLLECTIONS.ADMIN_SETTINGS).updateOne({ _id: MODERATION_WORKER_LOCK_ID, leaseToken }, update);
}

async function loadCandidate(db: Db, now: string): Promise<WorkerSubmission | null> {
  const rows = await db.collection(COLLECTIONS.SUBMISSIONS).find(dueWorkQuery(now)).sort({ createdAt: 1, _id: 1 }).limit(1).toArray();
  return (rows[0] as WorkerSubmission | undefined) ?? null;
}

async function loadJobSource(db: Db, jobId: string): Promise<WorkerSubmission | null> {
  return await db.collection(COLLECTIONS.SUBMISSIONS).findOne(remoteWorkQuery(jobId)) as WorkerSubmission | null;
}

async function updateFailed(db: Db, row: WorkerSubmission, code: string): Promise<boolean> {
  return safeUpdate(db, row, {
    'moderationPrecheck.status': 'failed',
    'moderationPrecheck.lastErrorCode': code.slice(0, 80),
    'moderationPrecheck.completedAt': dateNow(),
  }, { 'moderationPrecheck.jobId': '', 'moderationPrecheck.nextAttemptAt': '' });
}

async function makeRetryable(db: Db, row: WorkerSubmission, error: ModerationServiceError, retryGeneration: boolean): Promise<'retry' | 'failed'> {
  const precheck = stateOf(row);
  const attempts = typeof precheck.attempts === 'number' ? precheck.attempts : 0;
  if (!retryableServiceError(error) || attempts >= MODERATION_MAX_ATTEMPTS) {
    await updateFailed(db, row, error.code);
    return 'failed';
  }
  const unset: Document = { 'moderationPrecheck.jobId': '', 'moderationPrecheck.lastErrorCode': '' };
  const set: Document = {
    'moderationPrecheck.status': 'queued',
    'moderationPrecheck.lastErrorCode': error.code.slice(0, 80),
    'moderationPrecheck.nextAttemptAt': retryTime(attempts, error.retryAfterSeconds),
  };
  if (retryGeneration) {
    unset['moderationPrecheck.idempotencyKey'] = '';
    unset['moderationPrecheck.nextAttemptAt'] = '';
    set['moderationPrecheck.nextAttemptAt'] = retryTime(attempts, error.retryAfterSeconds);
    set['moderationPrecheck.generation'] = attempts + 1;
  }
  await safeUpdate(db, row, set, unset);
  return 'retry';
}

async function removeStaleSignal(db: Db, row: WorkerSubmission, code: string): Promise<void> {
  const precheck = stateOf(row);
  // This clears only this obsolete screening result. It never changes the photo's human decision.
  await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
    {
      _id: row._id,
      'moderationPrecheck.photoUrl': precheck.photoUrl,
      'moderationPrecheck.jobId': precheck.jobId,
      ...(typeof precheck.sourceRevision === 'string' ? { 'moderationPrecheck.sourceRevision': precheck.sourceRevision } : {}),
      ...(typeof precheck.normalizedRevision === 'string' ? { 'moderationPrecheck.normalizedRevision': precheck.normalizedRevision } : {}),
    },
    { $unset: { moderationPrecheck: '' }, $set: { 'metadata.moderationPrecheckDiscarded': code.slice(0, 80), updatedAt: dateNow() } },
  );
}

async function storeCompletedResult(db: Db, row: WorkerSubmission, job: RemoteModerationJob, now: string, loadImage: ModerationImageLoader): Promise<'completed' | 'discarded' | 'retry' | 'failed'> {
  const precheck = stateOf(row);
  const eventMongoId = typeof precheck.eventMongoId === 'string' ? precheck.eventMongoId : '';
  if (!moderationSourceEligible(row, precheck.photoUrl) || !eventMongoId || typeof precheck.sourceRevision !== 'string' || typeof precheck.normalizedRevision !== 'string') {
    await removeStaleSignal(db, row, 'source_no_longer_eligible');
    return 'discarded';
  }
  if (job.imageSha256 && job.imageSha256 !== precheck.normalizedRevision) {
    await removeStaleSignal(db, row, 'remote_input_hash_mismatch');
    return 'discarded';
  }
  // The Blob URL is immutable by design, but the current bytes are re-hashed before result application as an explicit stale-revision fence.
  let current;
  try {
    current = await loadImage(precheck.photoUrl!, eventMongoId);
  } catch {
    await removeStaleSignal(db, row, 'current_source_unavailable');
    return 'discarded';
  }
  if (current.sourceRevision !== precheck.sourceRevision || current.normalizedRevision !== precheck.normalizedRevision) {
    await removeStaleSignal(db, row, 'source_revision_changed');
    return 'discarded';
  }
  const parsed = parseCameraModerationResult(job.result);
  if (!parsed) {
    await updateFailed(db, row, 'result_schema_invalid');
    return 'failed';
  }
  const categories = parsed.categories;
  const result = await safeUpdate(db, row, {
    'moderationPrecheck.status': 'completed',
    'moderationPrecheck.completedAt': now,
    'moderationPrecheck.lastErrorCode': null,
    'moderationPrecheck.result': {
      schemaVersion: parsed.schema_version,
      schema_version: parsed.schema_version,
      review_required: parsed.review_required,
      automated_decision: parsed.automated_decision,
      model: parsed.model,
      signal: parsed.signal,
      flags: parsed.flags,
      categories,
      evidence: parsed.evidence,
      limitations: parsed.limitations,
      completedAt: now,
      sourceRevision: precheck.sourceRevision,
      normalizedRevision: precheck.normalizedRevision,
    },
  }, { 'moderationPrecheck.jobId': '', 'moderationPrecheck.nextAttemptAt': '', 'moderationPrecheck.leaseToken': '' });
  return result ? 'completed' : 'discarded';
}

async function processRemoteJob(
  db: Db,
  client: ModerationClient,
  leaseToken: string,
  jobId: string,
  startedAt: number,
  budgetMs: number,
  counters: ModerationWorkerResult,
  loadImage: ModerationImageLoader,
): Promise<'terminal' | 'waiting' | 'retry' | 'failed'> {
  const row = await loadJobSource(db, jobId);
  let job: RemoteModerationJob;
  try {
    job = await client.read(jobId, AbortSignal.timeout(10_000));
  } catch (error) {
    const serviceError = error instanceof ModerationServiceError ? error : new ModerationServiceError('service_unavailable', null);
    if (serviceError.status === 404) {
      if (row) {
        const outcome = await makeRetryable(db, row, serviceError, true);
        await setWorkerLock(db, leaseToken, {}, { activeJobId: '', activeJobStartedAt: '', activeNextPollAt: '', pendingUntil: '' });
        return outcome;
      }
      await setWorkerLock(db, leaseToken, {}, { activeJobId: '', activeJobStartedAt: '', activeNextPollAt: '', pendingUntil: '' });
      return 'terminal';
    }
    // An API/auth error cannot prove that the remote job stopped. Keep the
    // single Camera slot reserved until the service responds or its documented
    // queue/inference window expires; do not submit a second photo meanwhile.
    if (row) {
      const precheck = stateOf(row);
      await safeUpdate(db, row, { 'moderationPrecheck.status': 'queued_remote', 'moderationPrecheck.nextAttemptAt': retryTime(typeof precheck.attempts === 'number' ? precheck.attempts : 1, serviceError.retryAfterSeconds), 'moderationPrecheck.lastErrorCode': serviceError.code.slice(0, 80) });
    }
    await setWorkerLock(db, leaseToken, { activeNextPollAt: retryTime(1, serviceError.retryAfterSeconds) });
    return 'waiting';
  }

  if (job.status === 'queued' || job.status === 'running') {
    if (row && moderationSourceEligible(row, stateOf(row).photoUrl)) {
      await safeUpdate(db, row, { 'moderationPrecheck.status': job.status === 'queued' ? 'queued_remote' : 'running', 'moderationPrecheck.nextAttemptAt': null, 'moderationPrecheck.lastErrorCode': null });
    }
    await setWorkerLock(db, leaseToken, {}, { activeNextPollAt: '' });
    if (Date.now() - startedAt + MODERATION_POLL_MS < budgetMs) {
      await sleep(MODERATION_POLL_MS);
      return processRemoteJob(db, client, leaseToken, jobId, startedAt, budgetMs, counters, loadImage);
    }
    return 'waiting';
  }

  if (job.status === 'failed') {
    if (row) {
      const outcome = await makeRetryable(db, row, new ModerationServiceError(job.errorCode ?? 'analysis_failed', 503), true);
      if (outcome === 'failed') counters.failed += 1;
    }
    await deleteConsumedRemoteJob(client, jobId);
    await setWorkerLock(db, leaseToken, {}, { activeJobId: '', activeJobStartedAt: '', activeNextPollAt: '', pendingUntil: '' });
    return 'terminal';
  }

  if (row) {
    const parsed = parseCameraModerationResult(job.result);
    const outcome = await storeCompletedResult(db, row, job, dateNow(), loadImage);
    if (outcome === 'completed') {
      counters.completed += 1;
      if (parsed?.signal === 'flagged') counters.flagged += 1;
      if (parsed?.signal === 'uncertain') counters.uncertain += 1;
    } else if (outcome === 'failed') counters.failed += 1;
  }
  await deleteConsumedRemoteJob(client, jobId);
  await setWorkerLock(db, leaseToken, {}, { activeJobId: '', activeJobStartedAt: '', activeNextPollAt: '', pendingUntil: '' });
  return 'terminal';
}

async function pollUntilBudget(
  db: Db,
  client: ModerationClient,
  leaseToken: string,
  jobId: string,
  startedAt: number,
  budgetMs: number,
  counters: ModerationWorkerResult,
  loadImage: ModerationImageLoader,
): Promise<'terminal' | 'waiting' | 'retry' | 'failed'> {
  return processRemoteJob(db, client, leaseToken, jobId, startedAt, budgetMs, counters, loadImage);
}

async function prepareAndSubmit(db: Db, client: ModerationClient, row: WorkerSubmission, leaseToken: string, counters: ModerationWorkerResult, loadImage: ModerationImageLoader): Promise<string | null> {
  const precheck = stateOf(row);
  const eventMongoId = typeof precheck.eventMongoId === 'string' ? precheck.eventMongoId : '';
  const photoUrl = precheck.photoUrl;
  if (!moderationSourceEligible(row, photoUrl) || !eventMongoId || !isCameraPendingPhotoUrl(photoUrl, eventMongoId, process.env.BLOB_READ_WRITE_TOKEN)) {
    await updateFailed(db, row, 'source_not_eligible');
    counters.failed += 1;
    return null;
  }
  if (!hasVerifiableConsentAudit(row.consents)) {
    await updateFailed(db, row, 'consent_audit_missing');
    counters.failed += 1;
    return null;
  }

  let image;
  try {
    image = await loadImage(photoUrl!, eventMongoId);
  } catch (error) {
    const code = error instanceof ModerationServiceError ? error.code : 'source_unavailable';
    await updateFailed(db, row, code);
    counters.failed += 1;
    return null;
  }

  const previousRevision = typeof precheck.sourceRevision === 'string' ? precheck.sourceRevision : null;
  const changedSource = previousRevision !== null && previousRevision !== image.sourceRevision;
  const generation = typeof precheck.generation === 'number' ? precheck.generation : 1;
  const nextGeneration = changedSource ? generation + 1 : generation;
  const attempts = typeof precheck.attempts === 'number' ? precheck.attempts : 0;
  if (attempts >= MODERATION_MAX_ATTEMPTS) {
    await updateFailed(db, row, 'retry_limit_reached');
    counters.failed += 1;
    return null;
  }
  const idempotencyKey = !changedSource && typeof precheck.idempotencyKey === 'string'
    ? precheck.idempotencyKey
    : makeIdempotencyKey(String(row._id), image.sourceRevision, nextGeneration);
  const started = dateNow();
  const persisted = await safeUpdate(db, row, {
    'moderationPrecheck.status': 'submitting',
    'moderationPrecheck.sourceRevision': image.sourceRevision,
    'moderationPrecheck.normalizedRevision': image.normalizedRevision,
    'moderationPrecheck.idempotencyKey': idempotencyKey,
    'moderationPrecheck.startedAt': started,
    'moderationPrecheck.attempts': attempts + 1,
    'moderationPrecheck.generation': nextGeneration,
    'moderationPrecheck.lastErrorCode': null,
  }, { 'moderationPrecheck.nextAttemptAt': '' });
  if (!persisted) return null;
  // The source row is the durable outbox; the lock's pending window protects the rare erasure/crash gap before a returned job ID is saved.
  await setWorkerLock(db, leaseToken, {
    pendingUntil: new Date(Date.now() + 330_000).toISOString(),
    pendingSubmissionId: row._id,
  });
  try {
    const jobId = await client.submit(image.bytes, idempotencyKey, AbortSignal.timeout(10_000));
    const saved = await safeUpdate(db, row, { 'moderationPrecheck.status': 'queued_remote', 'moderationPrecheck.jobId': jobId, 'moderationPrecheck.lastErrorCode': null });
    await setWorkerLock(db, leaseToken, { activeJobId: jobId, activeJobStartedAt: dateNow() }, { pendingUntil: '', pendingSubmissionId: '' });
    counters.submitted += 1;
    if (!saved) {
      logWarn('camera.photo_moderation.source_changed_after_submit', 'The moderation job was accepted after its source stopped being eligible; its result will be discarded', { photoRef: String(row._id).slice(-8) });
    }
    return jobId;
  } catch (error) {
    const serviceError = error instanceof ModerationServiceError ? error : new ModerationServiceError('service_unavailable', null);
    if (serviceError.code === 'capacity_busy') {
      const latest = { ...row, moderationPrecheck: { ...precheck, status: 'submitting', sourceRevision: image.sourceRevision, normalizedRevision: image.normalizedRevision, idempotencyKey, attempts: attempts + 1 } } as WorkerSubmission;
      await makeRetryable(db, latest, serviceError, false);
      await setWorkerLock(db, leaseToken, { serviceBackoffUntil: retryTime(attempts + 1, serviceError.retryAfterSeconds) }, { pendingUntil: '', pendingSubmissionId: '' });
      counters.waiting += 1;
      return null;
    }
    if (retryableServiceError(serviceError)) {
      const latest = { ...row, moderationPrecheck: { ...precheck, status: 'submitting', sourceRevision: image.sourceRevision, normalizedRevision: image.normalizedRevision, idempotencyKey, attempts: attempts + 1 } } as WorkerSubmission;
      await safeUpdate(db, latest, {
        'moderationPrecheck.status': 'submitting',
        'moderationPrecheck.nextAttemptAt': retryTime(attempts + 1, serviceError.retryAfterSeconds),
        'moderationPrecheck.lastErrorCode': serviceError.code.slice(0, 80),
      });
      return null;
    }
    await updateFailed(db, row, serviceError.code);
    await setWorkerLock(db, leaseToken, {}, { pendingUntil: '', pendingSubmissionId: '' });
    counters.failed += 1;
    return null;
  }
}

/** One Camera-wide lease, one remote image at a time, sequentially draining a bounded batch within the cron budget. */
export async function runModerationPrecheckWorker(
  db: Db,
  options: { client?: ModerationClient; now?: () => Date; budgetMs?: number; maxBatch?: number; loadImage?: ModerationImageLoader } = {},
): Promise<ModerationWorkerResult> {
  const counters: ModerationWorkerResult = { status: 'processed', submitted: 0, completed: 0, flagged: 0, uncertain: 0, failed: 0, waiting: 0 };
  const configuration = options.client ? null : moderationConfiguration();
  if (!options.client && !configuration) {
    counters.status = 'not_configured';
    return counters;
  }
  const client = options.client ?? new CameraModerationClient(configuration!);
  const loadImage = options.loadImage ?? ((url, eventMongoId) => loadModerationImage(url, eventMongoId, { blobToken: process.env.BLOB_READ_WRITE_TOKEN }));
  const now = options.now ?? (() => new Date());
  const startedAt = Date.now();
  const token = randomUUID();
  const lock = await acquireGlobalLease(db, now().toISOString(), token);
  if (!lock) {
    counters.status = 'busy';
    return counters;
  }

  try {
    const serviceBackoffUntil = typeof lock.serviceBackoffUntil === 'string' ? Date.parse(lock.serviceBackoffUntil) : Number.NaN;
    if (Number.isFinite(serviceBackoffUntil) && serviceBackoffUntil > now().getTime()) {
      counters.waiting += 1;
      return counters;
    }
    if (Number.isFinite(serviceBackoffUntil) && serviceBackoffUntil <= now().getTime()) {
      await setWorkerLock(db, token, {}, { serviceBackoffUntil: '' });
    }
    const pendingUntil = typeof lock.pendingUntil === 'string' ? lock.pendingUntil : null;
    let activeJobId = typeof lock.activeJobId === 'string' ? lock.activeJobId : null;
    if (activeJobId) {
      const activeStartedAt = typeof lock.activeJobStartedAt === 'string' ? Date.parse(lock.activeJobStartedAt) : Number.NaN;
      if (Number.isFinite(activeStartedAt) && now().getTime() - activeStartedAt >= MODERATION_REMOTE_MAX_AGE_MS) {
        const expiredRow = await loadJobSource(db, activeJobId);
        if (expiredRow) {
          await updateFailed(db, expiredRow, 'remote_job_expired');
          counters.failed += 1;
        }
        await setWorkerLock(db, token, {}, { activeJobId: '', activeJobStartedAt: '', activeNextPollAt: '', pendingUntil: '' });
        activeJobId = null;
      }
    }
    const activeNextPollAt = typeof lock.activeNextPollAt === 'string' ? Date.parse(lock.activeNextPollAt) : Number.NaN;
    if (activeJobId && Number.isFinite(activeNextPollAt) && activeNextPollAt > now().getTime()) {
      counters.waiting += 1;
      return counters;
    }
    let nextCandidate: WorkerSubmission | null = null;
    if (pendingUntil && Date.parse(pendingUntil) > now().getTime() && !activeJobId) {
      // A POST timeout can mean Hetzner accepted a job but Camera never got its
      // ID. Retry/reconcile only this same idempotency key during that window;
      // never submit another photo while its remote state is ambiguous.
      const pendingSubmissionId = lock.pendingSubmissionId;
      const pendingRow = pendingSubmissionId
        ? await db.collection(COLLECTIONS.SUBMISSIONS).findOne({ _id: pendingSubmissionId }) as WorkerSubmission | null
        : null;
      if (!pendingRow || !moderationSourceEligible(pendingRow)) {
        counters.waiting += 1;
        return counters;
      }
      const nextAttemptAt = stateOf(pendingRow).nextAttemptAt;
      if (typeof nextAttemptAt === 'string' && Date.parse(nextAttemptAt) > now().getTime()) {
        counters.waiting += 1;
        return counters;
      }
      nextCandidate = pendingRow;
    } else {
      if (pendingUntil && Date.parse(pendingUntil) <= now().getTime() && !activeJobId) {
        await setWorkerLock(db, token, {}, { pendingUntil: '', pendingSubmissionId: '' });
      }
      nextCandidate = await loadCandidate(db, now().toISOString());
    }
    if (nextCandidate || activeJobId) {
      try {
        await client.discover();
      } catch (error) {
        const code = error instanceof ModerationServiceError ? error.code : 'discovery_failed';
        counters.status = 'discovery_failed';
        counters.waiting += 1;
        if (error instanceof ModerationServiceError && error.code === 'capacity_busy') {
          await setWorkerLock(db, token, { serviceBackoffUntil: retryTime(1, error.retryAfterSeconds) });
        }
        logWarn('camera.photo_moderation.discovery_failed', 'The moderation service was not discovered; human review remains available', { errorCode: code });
        return counters;
      }
    }

    let jobId = activeJobId;
    if (!jobId && nextCandidate) {
      const state = stateOf(nextCandidate);
      if (typeof state.jobId === 'string') {
        jobId = state.jobId;
        await setWorkerLock(db, token, { activeJobId: jobId, activeJobStartedAt: state.startedAt ?? now().toISOString() }, { pendingUntil: '', pendingSubmissionId: '' });
      }
    }

    let handled = 0;
    while (handled < (options.maxBatch ?? MODERATION_WORKER_MAX_BATCH) && Date.now() - startedAt < (options.budgetMs ?? MODERATION_WORKER_BUDGET_MS)) {
      if (jobId) {
        const outcome = await pollUntilBudget(db, client, token, jobId, startedAt, options.budgetMs ?? MODERATION_WORKER_BUDGET_MS, counters, loadImage);
        handled += 1;
        if (outcome === 'waiting') {
          counters.waiting += 1;
          break;
        }
        jobId = null;
        continue;
      }

      const candidate = await loadCandidate(db, now().toISOString());
      if (!candidate) break;
      const state = stateOf(candidate);
      if (typeof state.jobId === 'string') {
        jobId = state.jobId;
        await setWorkerLock(db, token, { activeJobId: jobId, activeJobStartedAt: state.startedAt ?? now().toISOString() }, { pendingUntil: '', pendingSubmissionId: '' });
        continue;
      }
      if (!moderationSourceEligible(candidate)) {
        await updateFailed(db, candidate, 'source_not_eligible');
        counters.failed += 1;
        handled += 1;
        continue;
      }
      const submittedJob = await prepareAndSubmit(db, client, candidate, token, counters, loadImage);
      handled += 1;
      if (!submittedJob) {
        const unresolved = await db.collection<{ _id: string; [key: string]: unknown }>(COLLECTIONS.ADMIN_SETTINGS).findOne({ _id: MODERATION_WORKER_LOCK_ID, leaseToken: token, pendingUntil: { $type: 'string' } });
        if (unresolved?.pendingUntil) {
          counters.waiting += 1;
          break;
        }
        const backoff = await db.collection<{ _id: string; [key: string]: unknown }>(COLLECTIONS.ADMIN_SETTINGS).findOne({ _id: MODERATION_WORKER_LOCK_ID, leaseToken: token, serviceBackoffUntil: { $type: 'string' } });
        if (typeof backoff?.serviceBackoffUntil === 'string' && Date.parse(backoff.serviceBackoffUntil) > now().getTime()) {
          counters.waiting += 1;
          break;
        }
        continue;
      }
      jobId = submittedJob;
    }

    const due = await loadCandidate(db, now().toISOString());
    if (due || (typeof lock.activeJobId === 'string' && jobId)) counters.waiting += 1;
    logInfo('camera.photo_moderation.run', 'The sequential photo moderation precheck run ended', {
      submitted: counters.submitted,
      completed: counters.completed,
      flagged: counters.flagged,
      uncertain: counters.uncertain,
      failed: counters.failed,
      waiting: counters.waiting,
    });
    return counters;
  } finally {
    await db.collection<{ _id: string; [key: string]: unknown }>(COLLECTIONS.ADMIN_SETTINGS).updateOne(
      { _id: MODERATION_WORKER_LOCK_ID, leaseToken: token },
      { $unset: { leaseToken: '', leaseUntil: '' }, $set: { lastRunAt: now().toISOString() } },
    );
  }
}
