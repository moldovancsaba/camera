import type { Document } from 'mongodb';
import { isValidEmail } from '@/lib/photo-vetting/pending';

/** Canonical participant contact state for a captured photo. Legacy mirrors remain read/write-compatible. */
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

export const GUEST_CONTACT_PLACEHOLDERS = new Set([
  'anonymous@event',
  'anonymous@event.com',
  'admin@upload',
  'unknown@unknown.com',
]);

const VALID_GUEST_EMAIL_FILTER = {
  $regex: /^(?!anonymous@event(?:\.com)?$)(?!admin@upload$)(?!unknown@unknown\.com$)[^\s@]+@[^\s@]+\.[^\s@]+$/i,
};

const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function guestEmailOf(value: unknown): string | null {
  const email = text(value);
  if (!email || !isValidEmail(email) || GUEST_CONTACT_PLACEHOLDERS.has(email.toLowerCase())) return null;
  return email.toLowerCase();
}

/** Resolve the authoritative contact. An explicit canonical state always wins over stale legacy mirrors. */
export function guestContactOf(input: unknown): GuestContact {
  const doc = record(input);
  const canonical = record(doc.guestContact);
  const status = canonical.status;
  if (status === 'erased') return { status: 'erased', source: null, name: null, email: null, updatedAt: text(canonical.updatedAt), completedAt: null };
  if (status === 'awaiting_contact' || status === 'draft' || status === 'complete') {
    const email = guestEmailOf(canonical.email);
    const complete = status === 'complete' && email !== null;
    return {
      status: complete ? 'complete' : status === 'draft' ? 'draft' : 'awaiting_contact',
      source: canonical.source === 'typed_email' || canonical.source === 'social_login' || canonical.source === 'legacy' ? canonical.source : null,
      name: text(canonical.name),
      email,
      updatedAt: text(canonical.updatedAt),
      completedAt: complete ? text(canonical.completedAt) : null,
    };
  }

  const userInfo = record(doc.userInfo);
  const draft = record(doc.userInfoDraft);
  const accountId = text(doc.userId);
  const collectedAt = text(userInfo.collectedAt);
  const hasDraftField = doc.userInfoDraft !== undefined;
  // userEmail was also populated by reviewer-side fallbacks. For a legacy account, trust it only when no guest draft exists.
  const legacyAccountEmail = accountId && accountId !== 'anonymous' && !hasDraftField ? guestEmailOf(doc.userEmail) : null;
  // An unfinished draft supersedes a legacy userInfo value unless that value has
  // an explicit finalization timestamp. This prevents stale pre-flow fields from
  // releasing a photo while the participant is still completing contact details.
  const hasUnfinalizedDraft = hasDraftField && !collectedAt;
  if (hasUnfinalizedDraft) {
    return {
      status: 'draft',
      source: 'typed_email',
      name: text(draft.name),
      email: guestEmailOf(draft.email),
      updatedAt: text(draft.updatedAt),
      completedAt: null,
    };
  }

  const email = guestEmailOf(userInfo.email) ?? legacyAccountEmail;
  if (email) {
    return {
      status: 'complete',
      source: 'legacy',
      name: text(userInfo.name) ?? text(doc.userName),
      email,
      updatedAt: collectedAt ?? text(doc.updatedAt),
      completedAt: collectedAt,
    };
  }

  const draftEmail = guestEmailOf(draft.email);
  if (draftEmail || hasDraftField) {
    return { status: 'draft', source: 'typed_email', name: text(draft.name), email: draftEmail, updatedAt: text(draft.updatedAt), completedAt: null };
  }
  return { status: 'awaiting_contact', source: null, name: null, email: null, updatedAt: text(doc.createdAt), completedAt: null };
}

export function hasFinalizedGuestContact(input: unknown): boolean {
  return guestContactOf(input).status === 'complete';
}

/** Admin-owned gallery uploads are not participant captures and do not require guest contact. */
export const processingContactMongoFilter: Document = {
  $or: [
    { 'metadata.adminGalleryUpload': true },
    {
      $or: [
        { 'guestContact.status': 'complete', 'guestContact.email': VALID_GUEST_EMAIL_FILTER },
        {
          $and: [
            { guestContact: { $exists: false } },
            { 'userInfo.email': VALID_GUEST_EMAIL_FILTER },
            { $or: [{ 'userInfo.collectedAt': { $type: 'string', $ne: '' } }, { userInfoDraft: { $exists: false } }] },
          ],
        },
        {
          $and: [
            { guestContact: { $exists: false } },
            { userInfoDraft: { $exists: false } },
            { userId: { $exists: true, $nin: ['', 'anonymous'] } },
            { userEmail: VALID_GUEST_EMAIL_FILTER },
            { $nor: [{ 'userInfo.email': VALID_GUEST_EMAIL_FILTER }] },
          ],
        },
      ],
    },
  ],
};

export function awaitingGuestContact(at: string): GuestContact {
  return { status: 'awaiting_contact', source: null, name: null, email: null, updatedAt: at, completedAt: null };
}

export function draftGuestContact(input: { name?: string; email?: string; at: string }): GuestContact {
  return {
    status: 'draft',
    source: 'typed_email',
    name: text(input.name),
    // Invalid input is still preserved by userInfoDraft; the canonical field only marks valid email as addressable.
    email: guestEmailOf(input.email),
    updatedAt: input.at,
    completedAt: null,
  };
}

export function finalizedGuestContact(input: { name: string; email: string; source: Exclude<GuestContactSource, 'legacy'>; at: string }): GuestContact {
  const email = guestEmailOf(input.email);
  if (!email) throw new Error('finalized_guest_contact_requires_valid_email');
  return { status: 'complete', source: input.source, name: text(input.name), email, updatedAt: input.at, completedAt: input.at };
}

export function incompleteContactErasure(at: string): { status: 'pending_erasure'; retentionExpiresAt: string } {
  return { status: 'pending_erasure', retentionExpiresAt: new Date(Date.parse(at) + 24 * 60 * 60 * 1000).toISOString() };
}

/** Mongo predicate for legacy anonymous captures due for the 24-hour erasure policy. */
export const anonymousWithoutFinalContactMongoFilter: Document = {
  $and: [
    { $or: [{ userId: 'anonymous' }, { userId: { $exists: false } }, { userId: null }, { userId: '' }] },
    { 'metadata.adminGalleryUpload': { $ne: true } },
    { $nor: [processingContactMongoFilter] },
  ],
};
