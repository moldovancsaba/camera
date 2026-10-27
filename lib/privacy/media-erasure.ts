import { BlobNotFoundError, del, head } from '@vercel/blob';
import type { Document } from 'mongodb';
import { checkPicture } from '@/lib/media/broken';
import { detectImageProvider, isRenderableImgbbImageUrl } from '@/lib/imgbb/url';
import { blobStoreHostFromToken } from '@/lib/submissions/original-image';
import { cameraOriginalR2CopyExists, deleteCameraOriginalR2Copy, isCameraOriginalR2Key } from '@/lib/storage/r2';

export type MediaProvider = 'blob' | 'r2' | 'imgbb' | 'unsupported';
export type MediaTaskState = 'pending' | 'processing' | 'retry' | 'deleted' | 'already_absent' | 'unknown' | 'failed';

export interface MediaReference {
  refIndex: number;
  provider: MediaProvider;
  url: string | null;
  deleteUrl: string | null;
  objectKey?: string | null;
  variants: string[];
}

export interface MediaDeleteTask {
  taskId: string;
  refIndex: number;
  provider: MediaProvider;
  variants: string[];
  status: MediaTaskState;
  attempt: number;
  nextAttemptAt: string;
  lastErrorCode?: string;
  processingAt?: string;
}

export type MediaDeleteOutcome =
  | { state: 'deleted' }
  | { state: 'already_absent' }
  | { state: 'retry'; errorCode: string }
  | { state: 'unknown'; errorCode: string };

const IMGBB_DELETE_HOSTS = new Set(['ibb.co', 'www.ibb.co', 'imgbb.com', 'www.imgbb.com']);
const URL_FIELDS = ['imageUrl', 'finalImageUrl', 'originalImageUrl', 'previewImageUrl', 'screenImageUrl'] as const;

function record(value: unknown): Document {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Document : {};
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isOwnBlobUrl(value: string, token: string | undefined): boolean {
  const storeHost = blobStoreHostFromToken(token);
  if (!storeHost) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.toLowerCase() === storeHost.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Extract only external deletion targets from the encrypted handoff. A URL is
 * never fetched or deleted unless its host matches a supported provider.
 * Historical `imageCopies` entries whose Blob object is already marked
 * deleted remain historical evidence and are not sent to Blob again.
 */
export function collectMediaReferences(encryptedPayload: Document, blobToken?: string): MediaReference[] {
  const candidates: Array<{ url: string | null; deleteUrl: string | null; objectKey: string | null; variant: string; alreadyDeleted?: boolean }> = [];
  const add = (urlValue: unknown, variant: string, deleteValue?: unknown, alreadyDeleted = false) => {
    const url = httpsUrl(urlValue);
    const deleteUrl = httpsUrl(deleteValue);
    if (url || deleteUrl) candidates.push({ url, deleteUrl, objectKey: null, variant, alreadyDeleted });
  };

  const topDeleteUrl = httpsUrl(encryptedPayload.deleteUrl);
  const primaryImage = httpsUrl(encryptedPayload.imageUrl);
  for (const field of URL_FIELDS) {
    const url = httpsUrl(encryptedPayload[field]);
    const deleteUrl = url && url === primaryImage && detectImageProvider(url) === 'imgbb' ? topDeleteUrl : undefined;
    add(url, field, deleteUrl);
  }
  add(encryptedPayload.legacyPhotoReviewUrl, 'legacyPhotoReviewUrl');
  add(encryptedPayload.legacyTryOnSourceImageUrl, 'legacyTryOnSourceImageUrl', encryptedPayload.legacyTryOnSourceDeleteUrl);
  if (topDeleteUrl && (!primaryImage || detectImageProvider(primaryImage) !== 'imgbb')) {
    add(null, 'orphanedDeleteUrl', topDeleteUrl);
  }

  if (Array.isArray(encryptedPayload.imageCopies)) {
    for (const [index, value] of encryptedPayload.imageCopies.entries()) {
      const copy = record(value);
      const deletedBlob = copy.store === 'blob' && copy.state === 'deleted';
      if (copy.store === 'r2' && copy.state !== 'deleted' && isCameraOriginalR2Key(copy.objectKey)) {
        candidates.push({ url: null, deleteUrl: null, objectKey: copy.objectKey, variant: typeof copy.role === 'string' ? copy.role : `imageCopy${index + 1}` });
      } else if (!deletedBlob) {
        add(copy.url, typeof copy.role === 'string' ? copy.role : `imageCopy${index + 1}`, copy.deleteUrl);
      }
    }
  }

  const grouped = new Map<string, { provider: MediaProvider; url: string | null; objectKey: string | null; deleteUrls: Set<string>; variants: Set<string> }>();
  for (const candidate of candidates) {
    if (candidate.alreadyDeleted) continue;
    const detected = candidate.url ? detectImageProvider(candidate.url) : null;
    const provider: MediaProvider = candidate.objectKey && isCameraOriginalR2Key(candidate.objectKey)
      ? 'r2'
      : candidate.url && new URL(candidate.url).protocol !== 'https:'
      ? 'unsupported'
      : detected === 'imgbb'
      ? 'imgbb'
      : detected === 'blob' && isOwnBlobUrl(candidate.url!, blobToken)
        ? 'blob'
        : !candidate.url && safeImgBbDeleteLink(candidate.deleteUrl)
          ? 'imgbb'
          : 'unsupported';
    const key = `${provider}\n${candidate.url ?? ''}\n${candidate.objectKey ?? ''}\n${candidate.deleteUrl ?? ''}`;
    const current = grouped.get(key) ?? { provider, url: candidate.url, objectKey: candidate.objectKey, deleteUrls: new Set<string>(), variants: new Set<string>() };
    if (candidate.deleteUrl) current.deleteUrls.add(candidate.deleteUrl);
    current.variants.add(candidate.variant.slice(0, 40));
    grouped.set(key, current);
  }

  return [...grouped.values()].map((item, refIndex) => ({
    refIndex,
    provider: item.provider,
    url: item.url,
    objectKey: item.objectKey,
    deleteUrl: item.deleteUrls.values().next().value ?? null,
    variants: [...item.variants].sort(),
  }));
}

export function createMediaDeleteTasks(references: MediaReference[], now: string): MediaDeleteTask[] {
  return references.map((reference) => ({
    taskId: `media-${reference.refIndex}`,
    refIndex: reference.refIndex,
    provider: reference.provider,
    variants: reference.variants,
    status: 'pending',
    attempt: 0,
    nextAttemptAt: now,
  }));
}

function isBlobMissing(error: unknown): boolean {
  return error instanceof BlobNotFoundError || (error instanceof Error && error.name === 'BlobNotFoundError');
}

function safeImgBbDeleteLink(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && IMGBB_DELETE_HOSTS.has(url.hostname.toLowerCase()) && !url.username && !url.password;
  } catch {
    return false;
  }
}

async function requestImgBbDelete(url: string): Promise<number> {
  const response = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  return response.status;
}

async function checkBlobPublicUrl(url: string): Promise<'absent' | 'present' | 'unknown'> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0', 'Cache-Control': 'no-cache', Accept: 'image/*' },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404 || response.status === 410) return 'absent';
    if (response.status === 200 || response.status === 206) return 'present';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Delete one allowlisted provider object and verify it is absent before returning success. */
export async function deleteAndVerifyMediaReference(
  reference: MediaReference,
  options: {
    blobToken?: string;
    deleteBlob?: typeof del;
    headBlob?: typeof head;
    checkBlobPublic?: typeof checkBlobPublicUrl;
    deleteImgBb?: (deleteUrl: string) => Promise<number>;
    checkPicture?: typeof checkPicture;
    isReferencedElsewhere?: (url: string) => Promise<boolean>;
  } = {},
): Promise<MediaDeleteOutcome> {
  const imageUrl = reference.url;
  if (reference.provider === 'r2') {
    const key = reference.objectKey;
    if (!key || !isCameraOriginalR2Key(key)) return { state: 'unknown', errorCode: 'r2_object_key_invalid' };
    try {
      if (!await cameraOriginalR2CopyExists(key)) return { state: 'already_absent' };
      await deleteCameraOriginalR2Copy(key);
      return { state: 'deleted' };
    } catch {
      return { state: 'retry', errorCode: 'r2_delete_or_verify_failed' };
    }
  }
  if (!imageUrl && reference.provider !== 'imgbb') return { state: 'unknown', errorCode: 'public_reference_missing' };
  if (imageUrl && options.isReferencedElsewhere && await options.isReferencedElsewhere(imageUrl)) {
    return { state: 'retry', errorCode: 'media_reference_shared' };
  }

  if (reference.provider === 'blob') {
    const token = options.blobToken?.trim();
    if (!imageUrl || !token || !isOwnBlobUrl(imageUrl, token)) return { state: 'unknown', errorCode: 'blob_credentials_or_store_unavailable' };
    const headBlob = options.headBlob ?? head;
    const deleteBlob = options.deleteBlob ?? del;
    let deleteFailed = false;
    let alreadyAbsent = false;
    try {
      await deleteBlob(imageUrl, { token, abortSignal: AbortSignal.timeout(10_000) });
    } catch (error) {
      if (isBlobMissing(error)) alreadyAbsent = true;
      else deleteFailed = true;
    }
    try {
      await headBlob(imageUrl, { token, abortSignal: AbortSignal.timeout(10_000) });
      return { state: 'retry', errorCode: deleteFailed ? 'blob_delete_failed' : 'blob_still_present' };
    } catch (error) {
      if (isBlobMissing(error)) {
        const publicState = await (options.checkBlobPublic ?? checkBlobPublicUrl)(imageUrl);
        if (publicState === 'absent') return { state: alreadyAbsent || deleteFailed ? 'already_absent' : 'deleted' };
        if (publicState === 'present') return { state: 'retry', errorCode: 'blob_cdn_delete_propagating' };
        return { state: 'retry', errorCode: 'blob_cdn_absence_unverified' };
      }
      return { state: 'retry', errorCode: 'blob_absence_unverified' };
    }
  }

  if (reference.provider === 'imgbb') {
    if (!safeImgBbDeleteLink(reference.deleteUrl)) {
      return { state: 'unknown', errorCode: 'imgbb_delete_reference_unavailable' };
    }
    if (!imageUrl) {
      const status = await (options.deleteImgBb ?? requestImgBbDelete)(reference.deleteUrl);
      return status >= 200 && status < 300
        ? { state: 'deleted' }
        : { state: 'unknown', errorCode: 'imgbb_orphan_delete_unverified' };
    }
    if (!isRenderableImgbbImageUrl(imageUrl)) return { state: 'unknown', errorCode: 'imgbb_public_reference_invalid' };
    const check = options.checkPicture ?? checkPicture;
    const before = await check(imageUrl);
    if (before === 'broken') return { state: 'already_absent' };
    if (before === 'unknown') return { state: 'retry', errorCode: 'imgbb_presence_unverified' };
    const deleteStatus = await (options.deleteImgBb ?? requestImgBbDelete)(reference.deleteUrl);
    const after = await check(imageUrl);
    if (after === 'broken') return { state: 'deleted' };
    if (deleteStatus === 404 || deleteStatus === 410) return { state: 'retry', errorCode: 'imgbb_delete_link_unavailable' };
    if (after === 'ok') return { state: 'retry', errorCode: 'imgbb_still_present' };
    return { state: 'retry', errorCode: 'imgbb_absence_unverified' };
  }

  return { state: 'unknown', errorCode: 'media_provider_unsupported' };
}
