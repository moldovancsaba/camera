import { NextRequest } from 'next/server';
import { ObjectId, type Document } from 'mongodb';
import { apiBadRequest, apiError, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { logWarn } from '@/lib/observability/logger';
import { requireCameraPrivacyMediaKey, requireCameraPrivacyResolver } from '@/lib/privacy/internal';
import { encryptMediaReferences, PRIVACY_ERASURE_ACTIVE_FILTER, type ErasureTargetState } from '@/lib/privacy/erasure';
import { buildSubjectMatchFilter } from '@/lib/privacy/subject-resolver';
import { getSsoPrivacySubjectProof, PrivacySubjectProofError } from '@/lib/privacy/subject-proof';
import type { SsoSubjectProof } from '@/lib/privacy/subject-proof';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 32_768;
const MAX_PHOTOS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHOTO_ID = /^[0-9a-f]{24}$/i;

interface ErasurePhotoTarget {
  photo_id: string;
  submission_id: string;
  event_id?: string | null;
}

interface Tombstone extends Document {
  _id: ObjectId;
  requestId: string;
  submissionId: string;
  eventId: string | null;
  status: ErasureTargetState;
  createdAt: string;
  updatedAt: string;
  mediaReferences?: ReturnType<typeof encryptMediaReferences>;
  recordErasedAt?: string;
  errorCode?: string;
}

export interface PrivacyEraseDependencies {
  authenticate(request: Request): string;
  mediaKey(): string;
  rateLimit(request: NextRequest): Promise<void>;
  getProof(requestId: string): Promise<SsoSubjectProof>;
  connectDatabase(): ReturnType<typeof connectToDatabase>;
  now(): string;
}

const defaultDependencies: PrivacyEraseDependencies = {
  authenticate: requireCameraPrivacyResolver,
  mediaKey: requireCameraPrivacyMediaKey,
  rateLimit: (request) => checkRateLimit(request, RATE_LIMITS.INTERNAL_WRITE),
  getProof: getSsoPrivacySubjectProof,
  connectDatabase: connectToDatabase,
  now: () => new Date().toISOString(),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseTargets(value: unknown): ErasurePhotoTarget[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PHOTOS) {
    throw apiBadRequest(`photos must contain between 1 and ${MAX_PHOTOS} exact photo references`);
  }
  const seen = new Set<string>();
  return value.map((item, index) => {
    if (!isRecord(item) || Object.keys(item).some((key) => !['photo_id', 'submission_id', 'event_id'].includes(key))) {
      throw apiBadRequest(`photos[${index}] contains unsupported fields`);
    }
    const photoId = typeof item.photo_id === 'string' ? item.photo_id.trim().toLowerCase() : '';
    const submissionId = typeof item.submission_id === 'string' ? item.submission_id.trim() : '';
    const eventId = item.event_id === undefined || item.event_id === null
      ? null
      : typeof item.event_id === 'string' ? item.event_id.trim() : undefined;
    if (!PHOTO_ID.test(photoId) || !submissionId || submissionId.length > 128 || /[\u0000-\u001f]/.test(submissionId)) {
      throw apiBadRequest(`photos[${index}] must include a valid photo_id and submission_id`);
    }
    if (eventId === undefined || (eventId !== null && (!eventId || eventId.length > 128 || /[\u0000-\u001f]/.test(eventId)))) {
      throw apiBadRequest(`photos[${index}].event_id must be a non-empty event id or null`);
    }
    if (seen.has(photoId)) throw apiBadRequest('photos must not contain duplicate photo_id values');
    seen.add(photoId);
    return { photo_id: photoId, submission_id: submissionId, event_id: eventId };
  });
}

function eventClause(eventId: string | null): Document | null {
  if (!eventId) return null;
  return { $or: [{ eventId }, { eventIds: eventId }] };
}

function receiptId(requestId: string, photoId: string): string {
  // Opaque deterministic evidence reference; no participant identifier is included.
  return `${requestId.slice(0, 8)}-${photoId.slice(-8)}`;
}

function stateFromTombstone(row: Tombstone): ErasureTargetState {
  return row.status;
}

/** Accept exact SSO-resolved photo IDs, fence them immediately, and enqueue record scrubbing. */
export function createPrivacyEraseHandler(dependencies: PrivacyEraseDependencies = defaultDependencies) {
  return async (request: NextRequest) => {
    dependencies.authenticate(request);
    await dependencies.rateLimit(request);

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw apiBadRequest('Request body is too large');
    const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (contentType !== 'application/json') throw apiBadRequest('Content-Type must be application/json');
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) throw apiBadRequest('Request body is too large');
    let body: unknown;
    try { body = JSON.parse(rawBody); } catch { throw apiBadRequest('A valid JSON body is required'); }
    if (!isRecord(body) || Object.keys(body).some((key) => !['request_id', 'photos'].includes(key))) {
      throw apiBadRequest('Only request_id and photos are supported');
    }

    const requestId = typeof body.request_id === 'string' ? body.request_id.trim() : '';
    if (!UUID.test(requestId)) throw apiBadRequest('A valid request_id is required');
    const targets = parseTargets(body.photos);
    const mediaKey = dependencies.mediaKey();

    let proof: SsoSubjectProof;
    try {
      proof = await dependencies.getProof(requestId);
    } catch (error) {
      if (error instanceof PrivacySubjectProofError && error.kind === 'invalid') {
        return apiSuccess({ version: 1, operation_id: requestId, status: 'invalid_request', photos: [] });
      }
      logWarn('privacy.camera_erasure.proof_unavailable', 'The verified privacy proof could not be read', { phase: 'sso_proof' });
      throw apiError('temporarily_unavailable', 503, { reason_code: 'identity_service_unavailable' });
    }

    const subjectFilter = buildSubjectMatchFilter(proof);
    if (!subjectFilter) return apiSuccess({ version: 1, operation_id: requestId, status: 'invalid_request', photos: [] });
    const db = await dependencies.connectDatabase();
    const submissions = db.collection(COLLECTIONS.SUBMISSIONS);
    const tombstones = db.collection<Tombstone>(COLLECTIONS.PRIVACY_ERASURE_TOMBSTONES);
    const now = dependencies.now();
    const photos: Array<{ photo_id: string; evidence_id: string; status: ErasureTargetState }> = [];

    for (const target of targets) {
      const objectId = new ObjectId(target.photo_id);
      const evidenceId = receiptId(requestId, target.photo_id);
      try {
        const prior = await tombstones.findOne({ _id: objectId });
        if (prior) {
          // The same request can safely resume. A different request receives no information about the first case.
          photos.push({ photo_id: target.photo_id, evidence_id: evidenceId, status: prior.requestId === requestId && prior.submissionId === target.submission_id && prior.eventId === (target.event_id ?? null) ? stateFromTombstone(prior) : 'not_found' });
          continue;
        }

        const targetClauses: Document[] = [subjectFilter, { _id: objectId, submissionId: target.submission_id }];
        const belongsToEvent = eventClause(target.event_id ?? null);
        if (belongsToEvent) targetClauses.push(belongsToEvent);
        const exactFilter = { $and: targetClauses };
        const submission = await submissions.findOne(exactFilter);
        if (!submission) {
          photos.push({ photo_id: target.photo_id, evidence_id: evidenceId, status: 'not_found' });
          continue;
        }

        const privacyErasure = isRecord(submission.privacyErasure) ? submission.privacyErasure : null;
        if (privacyErasure && privacyErasure.state === 'record_erased') {
          photos.push({ photo_id: target.photo_id, evidence_id: evidenceId, status: 'retryable_failure' });
          continue;
        }

        if (!privacyErasure || privacyErasure.state !== 'fenced') {
          const fenced = await submissions.updateOne(
            { $and: [exactFilter, PRIVACY_ERASURE_ACTIVE_FILTER] },
            { $set: { privacyErasure: { state: 'fenced', requestId, fencedAt: now }, isShareVisible: false, isSlideshowEligible: false, updatedAt: now } },
          );
          if (fenced.matchedCount !== 1) {
            photos.push({ photo_id: target.photo_id, evidence_id: evidenceId, status: 'retryable_failure' });
            continue;
          }
        } else if (privacyErasure.requestId !== requestId) {
          photos.push({ photo_id: target.photo_id, evidence_id: evidenceId, status: 'not_found' });
          continue;
        }

        // This receipt is the durable work item consumed by the privacy scrubber and the separate media-erasure issue.
        const tombstone: Tombstone = {
          _id: objectId,
          requestId,
          submissionId: target.submission_id,
          eventId: target.event_id ?? null,
          status: 'fenced',
          createdAt: now,
          updatedAt: now,
          mediaReferences: encryptMediaReferences(submission, mediaKey) ?? undefined,
        };
        await tombstones.updateOne(
          { _id: objectId },
          { $setOnInsert: tombstone },
          { upsert: true },
        );
        const savedTombstone = await tombstones.findOne({ _id: objectId });
        if (!savedTombstone || savedTombstone.requestId !== requestId || savedTombstone.submissionId !== target.submission_id) {
          photos.push({ photo_id: target.photo_id, evidence_id: evidenceId, status: 'not_found' });
          continue;
        }
        photos.push({ photo_id: target.photo_id, evidence_id: evidenceId, status: savedTombstone.status });
      } catch {
        logWarn('privacy.camera_erasure.target_failed', 'A privacy erasure target could not be fenced', { requestRef: requestId.slice(-8), photoRef: target.photo_id.slice(-8), phase: 'fence' });
        photos.push({ photo_id: target.photo_id, evidence_id: evidenceId, status: 'retryable_failure' });
      }
    }

    return apiSuccess({
      version: 1,
      operation_id: requestId,
      status: photos.some((photo) => photo.status === 'retryable_failure') ? 'partial' : 'accepted',
      photos,
    });
  };
}

export const POST = withErrorHandler(createPrivacyEraseHandler());
