import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import type { Document } from 'mongodb';

/** Mongo filter shared by every normal read/write path; absent markers stay compatible with legacy photos. */
export const PRIVACY_ERASURE_ACTIVE_FILTER = {
  'privacyErasure.state': { $nin: ['fenced', 'record_erased'] },
} as const;

export function privacyErasureIsFenced(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = (value as Record<string, unknown>).state;
  return state === 'fenced' || state === 'record_erased';
}

const MEDIA_REFERENCE_FIELDS = [
  'imageUrl',
  'finalImageUrl',
  'originalImageUrl',
  'previewImageUrl',
  'screenImageUrl',
  'deleteUrl',
] as const;

export interface EncryptedMediaReferences {
  version: 1;
  algorithm: 'aes-256-gcm';
  iv: string;
  tag: string;
  ciphertext: string;
}

export type ErasureTargetState = 'fenced' | 'processing' | 'record_erased' | 'media_pending' | 'media_processing' | 'media_erased' | 'media_review_required' | 'media_failed' | 'failed' | 'not_found' | 'retained_exception' | 'retryable_failure';

/** A scrubbed source row retains only the opaque photo key and retry fence needed to prevent resurrection. */
export function minimalErasedSubmission(input: { photoId: unknown; requestId: string; fencedAt: string; recordErasedAt: string }): Document {
  return {
    _id: input.photoId,
    privacyErasure: {
      state: 'record_erased',
      requestId: input.requestId,
      fencedAt: input.fencedAt,
      recordErasedAt: input.recordErasedAt,
    },
  };
}

/**
 * The media-provider task needs the old URLs/delete handles after the participant row is scrubbed.
 * Keep only this handoff encrypted in the restricted tombstone collection; it is not an image backup.
 */
export function encryptMediaReferences(submission: Document, mediaKey: string): EncryptedMediaReferences | null {
  const references: Document = Object.fromEntries(MEDIA_REFERENCE_FIELDS.flatMap((field) => {
    const value = submission[field];
    return typeof value === 'string' && value.trim().startsWith('https://') ? [[field, value.trim()]] : [];
  }));
  const photoReview = submission.photoReview && typeof submission.photoReview === 'object' ? submission.photoReview as Document : {};
  const tryOnRequest = submission.tryOnRequest && typeof submission.tryOnRequest === 'object' ? submission.tryOnRequest as Document : {};
  const secureUrl = (value: unknown): string | undefined => {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    try {
      const url = new URL(value.trim());
      return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.toString() : undefined;
    } catch {
      return undefined;
    }
  };
  // Keep only deletion references. Inline image bytes, provider IDs, review data, and try-on metadata are not part of this handoff.
  for (const [key, value] of Object.entries({
    legacyPhotoReviewUrl: secureUrl(photoReview.photoUrl),
    legacyTryOnSourceImageUrl: secureUrl(tryOnRequest.sourceImageUrl),
    legacyTryOnSourceDeleteUrl: secureUrl(tryOnRequest.sourceDeleteUrl),
  })) {
    if (typeof value === 'string' && value.trim()) references[key] = value.trim();
  }
  if (Array.isArray(submission.imageCopies)) {
    const copies = submission.imageCopies.flatMap((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
      const copy = value as Document;
      const url = secureUrl(copy.url);
      const deleteUrl = secureUrl(copy.deleteUrl);
      const objectKey = copy.store === 'r2' && typeof copy.objectKey === 'string' ? copy.objectKey : undefined;
      if (!url && !deleteUrl && !objectKey) return [];
      return [{
        ...(typeof copy.role === 'string' ? { role: copy.role.slice(0, 40) } : {}),
        ...(copy.store === 'blob' || copy.store === 'imgbb' || copy.store === 'r2' ? { store: copy.store } : {}),
        ...(typeof copy.state === 'string' ? { state: copy.state.slice(0, 24) } : {}),
        ...(url ? { url } : {}),
        ...(deleteUrl ? { deleteUrl } : {}),
        ...(objectKey ? { objectKey: objectKey.slice(0, 240) } : {}),
      }];
    });
    if (copies.length) references.imageCopies = copies;
  }
  if (Object.keys(references).length === 0) return null;

  const key = createHmac('sha256', mediaKey).update('camera-privacy-media-reference-v1').digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(references), 'utf8'), cipher.final()]);
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}

/** Used by the separate media-erasure issue after record erasure has completed. */
export function decryptMediaReferences(envelope: EncryptedMediaReferences, mediaKey: string): Document {
  if (envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm') throw new Error('Unsupported media reference envelope');
  const key = createHmac('sha256', mediaKey).update('camera-privacy-media-reference-v1').digest();
  const decryptor = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64url'));
  decryptor.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
  const clear = Buffer.concat([decryptor.update(Buffer.from(envelope.ciphertext, 'base64url')), decryptor.final()]).toString('utf8');
  const value: unknown = JSON.parse(clear);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid media reference envelope');
  return value as Document;
}
