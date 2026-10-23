import { createHmac, timingSafeEqual } from 'node:crypto';
import { ObjectId, type Document } from 'mongodb';
import type { SsoSubjectProof } from './subject-proof';
import { PRIVACY_ERASURE_ACTIVE_FILTER } from './erasure';

const INVALID_EMAILS = new Set(['anonymous@event', 'anonymous@event.com', 'admin@upload', 'unknown@unknown.com']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const SUBJECT_EMAIL_COLLATION = { locale: 'en', strength: 2 } as const;

export type PhotoMatchBasis = 'sso_account_id' | 'verified_email' | 'camera_photo_id';
export interface CameraPhotoMatch {
  photo_id: string;
  submission_id: string;
  event_ids: string[];
  partner_id: string | null;
  basis: PhotoMatchBasis;
}

export interface ResolverCursor {
  caseId: string;
  through: string;
  after: string;
}

function emailMatchBranches(email: string): Document[] {
  const exactAnonymous = /^anonymous$/;
  const exactEmpty = /^$/;
  return [
    { 'guestContact.status': 'complete', 'guestContact.email': email },
    {
      $and: [
        { guestContact: { $exists: false } },
        { 'userInfo.email': email },
        { $or: [{ 'userInfo.collectedAt': { $type: 'string', $ne: '' } }, { userInfoDraft: { $exists: false } }] },
      ],
    },
    {
      $and: [
        { guestContact: { $exists: false } },
        { userInfoDraft: { $exists: false } },
        { userId: { $exists: true } },
        { userEmail: email },
        { $nor: [{ userId: exactEmpty }, { userId: exactAnonymous }] },
      ],
    },
  ];
}

export function normalizedVerifiedEmail(proof: SsoSubjectProof): string | null {
  const email = proof.verifiedEmail?.value.trim().toLowerCase();
  return email && EMAIL_PATTERN.test(email) && !INVALID_EMAILS.has(email) ? email : null;
}

/** Exact identity lookup over only participant-owned fields; reviewer fields never enter the query. */
export function buildSubjectMatchFilter(proof: SsoSubjectProof): Document | null {
  let identityFilter: Document;
  if (proof.subject.kind === 'camera_photo') {
    const alternatives: Document[] = [{ submissionId: proof.subject.id }];
    if (ObjectId.isValid(proof.subject.id)) alternatives.push({ _id: new ObjectId(proof.subject.id) });
    identityFilter = { $or: alternatives };
  } else {
    const escapedId = proof.subject.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Account IDs stay case-sensitive even when the operation uses a collation
    // for legacy e-mail fields (Mongo regex matching is not collation-aware).
    const alternatives: Document[] = [{ userId: { $regex: `^${escapedId}$` } }];
    const email = normalizedVerifiedEmail(proof);
    if (email) alternatives.push(...emailMatchBranches(email));
    identityFilter = { 'metadata.adminGalleryUpload': { $ne: true }, $or: alternatives };
  }
  return { $and: [identityFilter, PRIVACY_ERASURE_ACTIVE_FILTER] };
}

/** A stable account conflict on a verified-email match makes the whole resolution ambiguous. */
export function buildEmailConflictFilter(proof: SsoSubjectProof): Document | null {
  if (proof.subject.kind !== 'sso_user') return null;
  const email = normalizedVerifiedEmail(proof);
  if (!email) return null;
  return {
    'metadata.adminGalleryUpload': { $ne: true },
    ...PRIVACY_ERASURE_ACTIVE_FILTER,
    userId: { $exists: true },
    $nor: [
      { userId: /^$/ },
      { userId: /^anonymous$/ },
      { userId: new RegExp(`^${proof.subject.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) },
    ],
    $or: emailMatchBranches(email),
  };
}

export function toCameraPhotoMatch(row: Record<string, unknown>, accountId?: string): CameraPhotoMatch | null {
  const rawId = row._id instanceof ObjectId ? row._id.toHexString() : typeof row._id === 'string' ? row._id : null;
  if (!rawId) return null;
  const eventIds = new Set<string>();
  if (typeof row.eventId === 'string' && row.eventId.trim()) eventIds.add(row.eventId.trim());
  if (Array.isArray(row.eventIds)) {
    for (const id of row.eventIds) if (typeof id === 'string' && id.trim()) eventIds.add(id.trim());
  }
  const basis: PhotoMatchBasis = accountId && row.userId === accountId
    ? 'sso_account_id'
    : accountId
      ? 'verified_email'
      : 'camera_photo_id';
  return {
    photo_id: rawId,
    submission_id: typeof row.submissionId === 'string' && row.submissionId.trim() ? row.submissionId.trim() : rawId,
    event_ids: [...eventIds].sort(),
    partner_id: typeof row.partnerId === 'string' && row.partnerId.trim() ? row.partnerId.trim() : null,
    basis,
  };
}

export function createResolverCursor(value: ResolverCursor, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, ...value })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function readResolverCursor(token: string, caseId: string, secret: string): ResolverCursor | null {
  if (token.length > 512) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (decoded.v !== 1 || decoded.caseId !== caseId || typeof decoded.through !== 'string' || !ObjectId.isValid(decoded.through) || typeof decoded.after !== 'string' || !ObjectId.isValid(decoded.after)) return null;
    if (decoded.after.localeCompare(decoded.through) > 0) return null;
    return { caseId, through: decoded.through, after: decoded.after };
  } catch {
    return null;
  }
}
