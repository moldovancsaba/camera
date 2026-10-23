import { NextRequest } from 'next/server';
import { ObjectId, type Document } from 'mongodb';
import { apiBadRequest, apiError, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { logWarn } from '@/lib/observability/logger';
import { requireCameraPrivacyResolver } from '@/lib/privacy/internal';
import {
  buildEmailConflictFilter,
  buildSubjectMatchFilter,
  createResolverCursor,
  normalizedVerifiedEmail,
  readResolverCursor,
  SUBJECT_EMAIL_COLLATION,
  toCameraPhotoMatch,
} from '@/lib/privacy/subject-resolver';
import { getSsoPrivacySubjectProof, PrivacySubjectProofError } from '@/lib/privacy/subject-proof';
import type { SsoSubjectProof } from '@/lib/privacy/subject-proof';

const MAX_BODY_BYTES = 4_096;
const MAX_PAGE_SIZE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHOTO_PROJECTION = { _id: 1, submissionId: 1, eventId: 1, eventIds: 1, partnerId: 1, userId: 1 };

function response(requestId: string, status: string, extra: Record<string, unknown> = {}) {
  return apiSuccess({ version: 1, request_id: requestId, status, ...extra });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function photoRefFilter(proof: Awaited<ReturnType<typeof getSsoPrivacySubjectProof>>): Document | null {
  return buildSubjectMatchFilter(proof);
}

export interface SubjectResolverDependencies {
  authenticate(request: Request): string;
  rateLimit(request: NextRequest): Promise<void>;
  getProof(requestId: string): Promise<SsoSubjectProof>;
  connectDatabase(): ReturnType<typeof connectToDatabase>;
}

const defaultDependencies: SubjectResolverDependencies = {
  authenticate: requireCameraPrivacyResolver,
  rateLimit: (request) => checkRateLimit(request, RATE_LIMITS.INTERNAL_READ),
  getProof: getSsoPrivacySubjectProof,
  connectDatabase: connectToDatabase,
};

export function createPrivacySubjectResolver(dependencies: SubjectResolverDependencies = defaultDependencies) {
  return async (request: NextRequest) => {
  const cursorSecret = dependencies.authenticate(request);
  await dependencies.rateLimit(request);

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw apiBadRequest('Request body is too large');
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw apiBadRequest('Content-Type must be application/json');
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) throw apiBadRequest('Request body is too large');
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { throw apiBadRequest('A valid JSON body is required'); }
  if (!isRecord(body)) throw apiBadRequest('A JSON object is required');
  if (Object.keys(body).some((key) => !['request_id', 'cursor', 'limit'].includes(key))) throw apiBadRequest('Unsupported request field');

  const requestId = typeof body.request_id === 'string' ? body.request_id.trim() : '';
  if (!UUID.test(requestId)) throw apiBadRequest('A valid request_id is required');
  const limit = body.limit === undefined ? MAX_PAGE_SIZE : body.limit;
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > MAX_PAGE_SIZE) throw apiBadRequest('limit must be an integer between 1 and 100');
  const cursorToken = body.cursor === undefined ? null : typeof body.cursor === 'string' ? body.cursor : '';
  if (cursorToken === '') throw apiBadRequest('cursor must be a valid opaque cursor');

  let proof;
  try {
    proof = await dependencies.getProof(requestId);
  } catch (error) {
    if (error instanceof PrivacySubjectProofError && error.kind === 'invalid') {
      return response(requestId, 'invalid_proof', { reason_code: 'case_not_resolvable', candidate_count: 0, matches: [], complete: true });
    }
    logWarn('privacy.subject_resolution.unavailable', 'The verified subject proof could not be read', { phase: 'sso_proof' });
    throw apiError('temporarily_unavailable', 503, { reason_code: 'identity_service_unavailable' });
  }

  const baseFilter = photoRefFilter(proof);
  if (!baseFilter) return response(requestId, 'invalid_proof', { reason_code: 'unsupported_subject', candidate_count: 0, matches: [], complete: true });

  try {
    const db = await dependencies.connectDatabase();
    const submissions = db.collection(COLLECTIONS.SUBMISSIONS);

    if (proof.subject.kind === 'camera_photo') {
      const candidateCount = await submissions.countDocuments(baseFilter);
      if (candidateCount === 0) return response(requestId, 'no_match', { candidate_count: 0, matches: [], complete: true });
      if (candidateCount !== 1) return response(requestId, 'ambiguous', { reason_code: 'duplicate_photo_reference', candidate_count: candidateCount, matches: [], complete: true });
      const row = await submissions.findOne(baseFilter, { projection: PHOTO_PROJECTION });
      const match = row ? toCameraPhotoMatch(row) : null;
      if (!match) return response(requestId, 'temporarily_unavailable', { reason_code: 'photo_reference_unavailable', candidate_count: candidateCount, matches: [], complete: true });
      return response(requestId, 'resolved', { candidate_count: 1, matches: [match], complete: true });
    }

    const parsedCursor = cursorToken ? readResolverCursor(cursorToken, requestId, cursorSecret) : null;
    if (cursorToken && !parsedCursor) throw apiBadRequest('cursor is invalid or belongs to another request');
    const through = parsedCursor?.through;
    const initialUpper = through ? null : await submissions
      .find(baseFilter, { projection: { _id: 1 }, collation: SUBJECT_EMAIL_COLLATION })
      .sort({ _id: -1 })
      .limit(1)
      .toArray();
    const upperId = through ?? (initialUpper?.[0]?._id instanceof ObjectId ? initialUpper[0]._id.toHexString() : null);
    if (!upperId) return response(requestId, 'no_match', { candidate_count: 0, matches: [], complete: true });

    const upper = new ObjectId(upperId);
    const lower = parsedCursor ? new ObjectId(parsedCursor.after) : null;
    const snapshotFilter: Document = { $and: [baseFilter, { _id: { $lte: upper, ...(lower ? { $gt: lower } : {}) } }] };
    const conflictFilter = buildEmailConflictFilter(proof);
    const [candidateCount, conflictingAccountCount] = await Promise.all([
      submissions.countDocuments({ $and: [baseFilter, { _id: { $lte: upper } }] }, { collation: SUBJECT_EMAIL_COLLATION }),
      conflictFilter ? submissions.countDocuments({ $and: [conflictFilter, { _id: { $lte: upper } }] }, { collation: SUBJECT_EMAIL_COLLATION }) : Promise.resolve(0),
    ]);

    // A verified address attached to another stable account is not safe to
    // resolve automatically. Return no references and let the operator review.
    if (conflictingAccountCount > 0) {
      return response(requestId, 'ambiguous', { reason_code: 'verified_email_account_conflict', candidate_count: candidateCount, matches: [], complete: true });
    }
    if (candidateCount === 0) return response(requestId, 'no_match', { candidate_count: 0, matches: [], complete: true });

    const rows = await submissions.find(snapshotFilter, { projection: PHOTO_PROJECTION, collation: SUBJECT_EMAIL_COLLATION }).sort({ _id: 1 }).limit((limit as number) + 1).toArray();
    const hasMore = rows.length > (limit as number);
    const page = rows.slice(0, limit as number);
    const email = normalizedVerifiedEmail(proof);
    const matches = page.map((row) => toCameraPhotoMatch(row, proof.subject.id)).filter((match): match is NonNullable<typeof match> => Boolean(match));
    const lastId = page.at(-1)?._id;
    const nextCursor = hasMore && lastId instanceof ObjectId
      ? createResolverCursor({ caseId: requestId, through: upperId, after: lastId.toHexString() }, cursorSecret)
      : null;

    // Guard against a schema/query regression that selected a row via neither
    // exact stable-account ID nor the exact verified address.
    if (matches.some((match) => match.basis === 'verified_email') && !email) {
      return response(requestId, 'ambiguous', { reason_code: 'unverified_email_match', candidate_count: candidateCount, matches: [], complete: true });
    }
    return response(requestId, 'resolved', { candidate_count: candidateCount, matches, complete: !hasMore, ...(nextCursor ? { next_cursor: nextCursor } : {}) });
  } catch (error) {
    if (error instanceof Response) throw error;
    logWarn('privacy.subject_resolution.unavailable', 'The Camera subject lookup could not be completed', { phase: 'camera_lookup' });
    throw apiError('temporarily_unavailable', 503, { reason_code: 'camera_lookup_unavailable' });
  }
  };
}

export const POST = withErrorHandler(createPrivacySubjectResolver());
