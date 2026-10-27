/** Required three-provider replication for a submitted full-frame Camera original. */

import { createHash } from 'node:crypto';
import type { ImageCopy } from '@/lib/db/schemas';
import { uploadToImgbbOnly, deleteImage, type MirrorResult } from '@/lib/imgbb/upload';
import { isRenderableImgbbImageUrl } from '@/lib/imgbb/url';
import { deleteCameraOriginalR2Copy, putVerifiedOriginalR2Copy } from '@/lib/storage/r2';
import { logWarn } from '@/lib/observability/logger';

const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
const IMGBB_READ_TIMEOUT_MS = 25_000;

export class OriginalBackupError extends Error {
  readonly failedStores: Array<'r2' | 'imgbb'>;
  readonly cleanupPendingCopies: ImageCopy[];

  constructor(failedStores: Array<'r2' | 'imgbb'>, cleanupPendingCopies: ImageCopy[] = []) {
    super('The original image could not be copied and verified in every required storage provider');
    this.name = 'OriginalBackupError';
    this.failedStores = failedStores;
    this.cleanupPendingCopies = cleanupPendingCopies;
  }
}

function validIdentity(value: string): string {
  const clean = value.trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(clean)) throw new Error('Invalid event storage identity');
  return clean;
}

async function readImgBbCopy(url: string): Promise<Buffer> {
  if (!isRenderableImgbbImageUrl(url)) throw new Error('ImgBB returned an invalid original-image URL');
  const response = await fetch(url, {
    headers: { Accept: 'image/jpeg', 'Cache-Control': 'no-cache' },
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(IMGBB_READ_TIMEOUT_MS),
  });
  if (!response.ok || !(response.headers.get('content-type') ?? '').toLowerCase().startsWith('image/')) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`ImgBB original read-back failed with HTTP ${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('ImgBB original read-back returned no body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ORIGINAL_BYTES) {
        await reader.cancel('Original exceeds the configured size limit').catch(() => undefined);
        throw new Error('ImgBB original read-back exceeded the size limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
}

function hash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function uploadImgBbAndVerify(bytes: Buffer, expectedHash: string, name: string): Promise<MirrorResult> {
  const uploaded = await uploadToImgbbOnly(bytes.toString('base64'), {
    name,
    maxRetries: 2,
    retryDelay: 1000,
    validatePublicUrl: false,
  });
  try {
    const stored = await readImgBbCopy(uploaded.imageUrl);
    if (stored.byteLength !== bytes.byteLength || hash(stored) !== expectedHash) {
      throw new Error('ImgBB original read-back differs from the submitted file');
    }
    return uploaded;
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error('ImgBB original read-back failed'), { uploaded });
  }
}

/**
 * Replicate an accepted full-frame source before Camera acknowledges the submission.
 * Vercel Blob is the capture landing copy; R2 and ImgBB must both be present and byte-identical.
 * If either secondary store fails, the successful secondary copy is rolled back and the caller
 * keeps the participant in the retryable save state.
 */
export async function createRequiredOriginalBackups(input: {
  eventId: string;
  submissionId: string;
  sourceUrl: string;
  bytes: Buffer;
  now?: string;
}): Promise<ImageCopy[]> {
  if (!input.bytes.byteLength || input.bytes.byteLength > MAX_ORIGINAL_BYTES) throw new Error('Original image size is outside the supported limit');
  const eventId = validIdentity(input.eventId);
  const submissionId = validIdentity(input.submissionId);
  const sha256 = hash(input.bytes);
  const key = `camera/originals/${eventId}/${submissionId}/${sha256}.jpg`;
  const now = input.now ?? new Date().toISOString();
  const outcomes = await Promise.allSettled([
    putVerifiedOriginalR2Copy({ key, bytes: input.bytes, sha256 }),
    uploadImgBbAndVerify(input.bytes, sha256, `camera-original-${submissionId}`),
  ]);
  const r2Ok = outcomes[0].status === 'fulfilled';
  const imgbbOk = outcomes[1].status === 'fulfilled';
  if (!r2Ok || !imgbbOk) {
    const uploadedImgBb = outcomes[1].status === 'fulfilled'
      ? outcomes[1].value
      : (outcomes[1].reason as { uploaded?: MirrorResult } | undefined)?.uploaded;
    // A failed PUT can still have committed remotely before its response was lost,
    // so always try deleting the deterministic R2 key. Capture unsuccessful
    // rollbacks in the asset manifest so the scheduled cleanup can retry them.
    const cleanup = await Promise.allSettled([
      deleteCameraOriginalR2Copy(key),
      uploadedImgBb ? deleteImage(uploadedImgBb.deleteUrl, uploadedImgBb.imageUrl) : Promise.resolve(true),
    ]);
    const cleanupPendingCopies: ImageCopy[] = [];
    if (cleanup[0].status === 'rejected') {
      cleanupPendingCopies.push({ role: 'original', store: 'r2', state: 'unverified', url: null, objectKey: key, bytes: input.bytes.byteLength, verifiedAt: null, recordedAt: now, error: 'rollback_pending' });
    }
    if (uploadedImgBb && (cleanup[1].status === 'rejected' || cleanup[1].value === false)) {
      cleanupPendingCopies.push({ role: 'original', store: 'imgbb', state: 'unverified', url: uploadedImgBb.imageUrl, deleteUrl: uploadedImgBb.deleteUrl, externalId: uploadedImgBb.imageId, bytes: input.bytes.byteLength, verifiedAt: null, recordedAt: now, error: 'rollback_pending' });
    }
    cleanupPendingCopies.forEach((copy) => {
      logWarn('original_backup.rollback_failed', 'A partial original-image backup could not be removed after replication failed', {
        eventId,
        submissionRef: submissionId.slice(-8),
        store: copy.store,
      });
    });
    throw new OriginalBackupError([
      ...(!r2Ok ? ['r2' as const] : []),
      ...(!imgbbOk ? ['imgbb' as const] : []),
    ], cleanupPendingCopies);
  }

  const mirror = (outcomes[1] as PromiseFulfilledResult<MirrorResult>).value;
  return [
    { role: 'original', store: 'blob', state: 'verified', url: input.sourceUrl, bytes: input.bytes.byteLength, verifiedAt: now, recordedAt: now },
    { role: 'original', store: 'r2', state: 'verified', url: null, objectKey: key, bytes: input.bytes.byteLength, verifiedAt: now, recordedAt: now },
    { role: 'original', store: 'imgbb', state: 'verified', url: mirror.imageUrl, deleteUrl: mirror.deleteUrl, externalId: mirror.imageId, bytes: input.bytes.byteLength, verifiedAt: now, recordedAt: now },
  ];
}

/** Delete and verify all external copies listed for an unattached or erased original. */
export async function deleteOriginalBackupCopies(copies: ImageCopy[]): Promise<void> {
  const external = copies.filter((copy) => copy.role === 'original' && copy.state !== 'deleted' && copy.store !== 'blob');
  await Promise.all(external.map(async (copy) => {
    if (copy.store === 'r2') {
      if (!copy.objectKey) throw new Error('Original R2 object key is missing');
      await deleteCameraOriginalR2Copy(copy.objectKey);
      return;
    }
    if (copy.store === 'imgbb') {
      if (!copy.deleteUrl || !copy.url || !await deleteImage(copy.deleteUrl, copy.url)) {
        throw new Error('Original ImgBB copy could not be deleted and verified');
      }
    }
  }));
}
