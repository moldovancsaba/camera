/** Remove unattached full-frame originals from every provider after their 24-hour capture window. */

import { del as deleteBlob } from '@vercel/blob';
import { NextRequest } from 'next/server';
import type { Document } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';
import { deleteOriginalBackupCopies } from '@/lib/storage/original-backups';
import { blobStoreHostFromToken, isOriginalBlobUrl } from '@/lib/submissions/original-image';
import { logWarn } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 4;
const CLEANUP_LEASE_MS = 30 * 60 * 1000;
const RETRY_DELAY_MS = 15 * 60 * 1000;

export const GET = withErrorHandler(async (request: NextRequest) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  const auth = checkSharedSecret(process.env.CRON_SECRET?.trim(), token);
  if (auth !== 'ok') {
    if (auth === 'not_configured') console.warn('[internal-auth] original asset cleanup: CRON_SECRET is not configured; cleanup stays disabled (fail closed)');
    else logSharedSecretRejection('original asset cleanup', 'CRON_SECRET', auth);
    throw apiForbidden();
  }

  const db = await connectToDatabase();
  const assets = db.collection(COLLECTIONS.ORIGINAL_ASSETS);
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - CLEANUP_LEASE_MS).toISOString();
  const candidates = await assets.find({
    $or: [
      { expiresAt: { $lte: now }, state: { $in: ['ready', 'failed', 'verified', 'replicating'] } },
      { state: 'cleanup_failed', $or: [{ nextCleanupAt: { $lte: now } }, { nextCleanupAt: { $exists: false } }] },
      { state: 'cleanup_in_progress', $or: [{ cleanupStartedAt: { $lte: staleBefore } }, { cleanupStartedAt: { $exists: false } }] },
    ],
  }).sort({ expiresAt: 1 }).limit(BATCH_SIZE).toArray();

  let deleted = 0;
  let attached = 0;
  let retried = 0;
  const storeHost = blobStoreHostFromToken(process.env.BLOB_READ_WRITE_TOKEN);

  await Promise.all(candidates.map(async (candidate) => {
    const cleanupAt = new Date().toISOString();
    const claimFilter: Document = { _id: candidate._id, state: candidate.state };
    if (candidate.state === 'ready' || candidate.state === 'failed' || candidate.state === 'verified' || candidate.state === 'replicating') {
      claimFilter.expiresAt = { $lte: now };
    } else if (candidate.state === 'cleanup_failed') {
      claimFilter.$or = [{ nextCleanupAt: { $lte: now } }, { nextCleanupAt: { $exists: false } }];
    } else if (candidate.state === 'cleanup_in_progress') {
      claimFilter.$or = [{ cleanupStartedAt: { $lte: staleBefore } }, { cleanupStartedAt: { $exists: false } }];
    }
    const claim = await assets.updateOne(claimFilter, {
      $set: { state: 'cleanup_in_progress', cleanupStartedAt: cleanupAt, updatedAt: cleanupAt },
    });
    if (claim.modifiedCount !== 1) return;

    try {
      const existingSubmission = await db.collection(COLLECTIONS.SUBMISSIONS).findOne({
        $or: [
          { _id: candidate._id },
          ...(typeof candidate.url === 'string' ? [{ originalImageUrl: candidate.url }, { 'imageCopies.url': candidate.url }] : []),
        ],
      }, { projection: { _id: 1 } });
      if (existingSubmission) {
        await assets.updateOne(
          { _id: candidate._id, state: 'cleanup_in_progress', cleanupStartedAt: cleanupAt },
          { $set: { state: 'attached', submissionId: String(existingSubmission._id), attachedAt: cleanupAt, updatedAt: cleanupAt }, $unset: { expiresAt: '', cleanupStartedAt: '', nextCleanupAt: '' } },
        );
        attached += 1;
        return;
      }

      if (typeof candidate.eventId !== 'string' || !isOriginalBlobUrl(candidate.url, { eventId: candidate.eventId, storeHost })) {
        throw new Error('invalid_original_blob_reference');
      }
      // Remove failed partial mirrors after 15 minutes, but preserve the Blob
      // landing copy so the guest can retry the same capture for 24 hours.
      // Once the lease expires, the last pass deletes all three providers.
      const expired = typeof candidate.expiresAt === 'string' && candidate.expiresAt <= now;
      await deleteOriginalBackupCopies(Array.isArray(candidate.copies) ? candidate.copies : []);
      if (expired) {
        await deleteBlob(candidate.url);
        await assets.deleteOne({ _id: candidate._id, state: 'cleanup_in_progress', cleanupStartedAt: cleanupAt });
        deleted += 1;
      } else {
        await assets.updateOne(
          { _id: candidate._id, state: 'cleanup_in_progress', cleanupStartedAt: cleanupAt },
          { $set: { state: 'failed', copies: [], updatedAt: new Date().toISOString() }, $unset: { nextCleanupAt: '', cleanupStartedAt: '' } },
        );
        retried += 1;
      }
    } catch (error) {
      const retryAt = new Date(Date.now() + RETRY_DELAY_MS).toISOString();
      await assets.updateOne(
        { _id: candidate._id, state: 'cleanup_in_progress', cleanupStartedAt: cleanupAt },
        {
          $set: {
            state: 'cleanup_failed',
            nextCleanupAt: retryAt,
            lastError: error instanceof Error ? error.name : 'unknown_cleanup_failure',
            updatedAt: new Date().toISOString(),
          },
          $unset: { cleanupStartedAt: '' },
        },
      );
      logWarn('original_asset.cleanup_failed', 'An unattached original could not be cleaned up from every storage provider', {
        captureRef: String(candidate._id).slice(-8),
        eventId: typeof candidate.eventId === 'string' ? candidate.eventId : null,
        error: error instanceof Error ? error.name : 'unknown_cleanup_failure',
      });
      retried += 1;
    }
  }));

  return apiSuccess({ examined: candidates.length, deleted, attached, retried });
});
