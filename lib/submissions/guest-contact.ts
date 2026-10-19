import type { Document } from 'mongodb';
import { isValidEmail } from '@/lib/photo-vetting/pending';

export type GuestContactStatus = 'awaiting_contact' | 'draft' | 'complete' | 'erased';
export type GuestContactSource = 'typed_email' | 'social_login' | 'legacy';

export interface GuestContact {
  status: GuestContactStatus;
  source: GuestContactSource | null;
  name: string | null;
  email: string | null;
  updatedAt: string | null;
  completedAt: string | null;
}

export const GUEST_CONTACT_PLACEHOLDERS = new Set(['anonymous@event', 'anonymous@event.com', 'admin@upload', 'unknown@unknown.com']);
const VALID_GUEST_EMAIL_FILTER = {
  $regex: /^(?!anonymous@event(?:\.com)?$)(?!admin@upload$)[^\s@]+@[^\s@]+\.[^\s@]+$/i,
};

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});
const guestEmail = (value: unknown): string | null => {
  const email = text(value);
  return email && isValidEmail(email) && !GUEST_CONTACT_PLACEHOLDERS.has(email.toLowerCase()) ? email.toLowerCase() : null;
};

/** Canonical guest contact, with a defensive read of legacy fields for older submissions. */
export function guestContactOf(input: unknown): GuestContact {
  const doc = record(input);
  const canonical = record(doc.guestContact);
  const canonicalStatus = canonical.status;
  if (canonicalStatus === 'erased') {
    return { status: 'erased', source: null, name: null, email: null, updatedAt: text(canonical.updatedAt), completedAt: null };
  }
  if (canonicalStatus === 'awaiting_contact' || canonicalStatus === 'draft' || canonicalStatus === 'complete') {
    const email = guestEmail(canonical.email);
    const complete = canonicalStatus === 'complete' && email !== null;
    return {
      status: complete ? 'complete' : canonicalStatus === 'draft' ? 'draft' : 'awaiting_contact',
      source: canonical.source === 'typed_email' || canonical.source === 'social_login' || canonical.source === 'legacy' ? canonical.source : null,
      name: text(canonical.name),
      email,
      updatedAt: text(canonical.updatedAt),
      completedAt: complete ? text(canonical.completedAt) : null,
    };
  }

  const userInfo = record(doc.userInfo);
  const draft = record(doc.userInfoDraft);
  // `userEmail` has also been used for placeholders and reviewer-side fallbacks.
  // Only trust it as a legacy contact when the record is tied to a real account;
  // anonymous guest addresses belong in `userInfo.email`.
  const accountId = text(doc.userId);
  const legacyAccountEmail = accountId && accountId !== 'anonymous' && !Object.keys(draft).length ? guestEmail(doc.userEmail) : null;
  const finalizedEmail = guestEmail(userInfo.email) ?? legacyAccountEmail;
  if (finalizedEmail) {
    return {
      status: 'complete',
      source: 'legacy',
      name: text(userInfo.name) ?? text(doc.userName),
      email: finalizedEmail,
      updatedAt: text(userInfo.collectedAt) ?? text(doc.updatedAt),
      completedAt: text(userInfo.collectedAt),
    };
  }

  const draftEmail = guestEmail(draft.email);
  if (draftEmail) {
    return {
      status: 'draft', source: 'typed_email', name: text(draft.name), email: draftEmail,
      updatedAt: text(draft.updatedAt), completedAt: null,
    };
  }

  return {
    status: 'awaiting_contact', source: null, name: null, email: null,
    updatedAt: text(doc.createdAt), completedAt: null,
  };
}

export function hasFinalizedGuestContact(input: unknown): boolean {
  return guestContactOf(input).status === 'complete';
}

/** Admin-owned gallery media is not a guest capture and does not need a guest contact. */
export function canProcessSubmission(input: unknown): boolean {
  const doc = record(input);
  const metadata = record(doc.metadata);
  return !erasureBlocksProcessing(doc) && (metadata.adminGalleryUpload === true || hasFinalizedGuestContact(doc));
}

export function erasureBlocksProcessing(input: unknown): boolean {
  const status = record(record(input).erasure).status;
  return status === 'scheduled' || status === 'deleting' || status === 'complete';
}

export const activeRetentionMongoFilter: Document = {
  'erasure.status': { $nin: ['scheduled', 'deleting', 'complete'] },
};

export function canCompleteGuestContact(input: unknown, now: string = new Date().toISOString()): boolean {
  const state = record(record(input).erasure);
  if (state.status === 'deleting' || state.status === 'complete') return false;
  if (state.status === 'scheduled' && typeof state.deadlineAt === 'string' && state.deadlineAt <= now) return false;
  return true;
}

export function incompleteContactErasure(at: string): { status: 'scheduled'; reason: 'contact_not_completed'; scheduledAt: string; deadlineAt: string } {
  return {
    status: 'scheduled',
    reason: 'contact_not_completed',
    scheduledAt: at,
    deadlineAt: new Date(Date.parse(at) + 24 * 60 * 60 * 1000).toISOString(),
  };
}

/** Mongo predicate shared by the event queues and publication/analysis gates. */
export const finalizedGuestContactMongoFilter: Document = {
  $or: [
    { 'guestContact.status': 'complete', 'guestContact.email': VALID_GUEST_EMAIL_FILTER },
    { $and: [{ guestContact: { $exists: false } }, { 'userInfo.email': VALID_GUEST_EMAIL_FILTER }] },
    { $and: [{ guestContact: { $exists: false } }, { userInfo: { $exists: false } }, { userInfoDraft: { $exists: false } }, { userId: { $exists: true, $nin: ['', 'anonymous'] } }, { userEmail: VALID_GUEST_EMAIL_FILTER }] },
  ],
};

/** Mongo equivalent of `canProcessSubmission`; keep review, analysis, visibility and feeds aligned. */
export const processingContactMongoFilter: Document = {
  $or: [
    { 'metadata.adminGalleryUpload': true },
    finalizedGuestContactMongoFilter,
  ],
};

export const submissionProcessingMongoFilter: Document = {
  $and: [processingContactMongoFilter, activeRetentionMongoFilter],
};

/** Explicit, non-PII lifecycle fields. The address and name live in guestContact; old fields remain compatibility mirrors. */
export function finalizedGuestContactPatch(input: {
  name: string;
  email: string;
  source: Exclude<GuestContactSource, 'legacy'>;
  at: string;
}): Record<string, unknown> {
  return {
    guestContact: {
      status: 'complete',
      source: input.source,
      name: input.name,
      email: input.email.trim().toLowerCase(),
      updatedAt: input.at,
      completedAt: input.at,
    },
    userInfo: { name: input.name, email: input.email, collectedAt: input.at },
    userName: input.name,
    userEmail: input.email.trim().toLowerCase(),
  };
}
