import { NextRequest } from 'next/server';
import { ObjectId, type Document } from 'mongodb';
import { apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { logSharedSecretRejection } from '@/lib/security/safeEqual';
import { checkSharedSecret } from '@/lib/security/safeEqual';
import { logWarn } from '@/lib/observability/logger';
import { encryptMediaReferences, minimalErasedSubmission } from '@/lib/privacy/erasure';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 40;
const STALE_CLAIM_MS = 15 * 60 * 1_000;
const MAX_ATTEMPTS = 10;

interface ErasureReceipt extends Document {
  _id: ObjectId;
  requestId: string;
  status: 'fenced' | 'processing' | 'record_erased' | 'media_pending' | 'failed';
  createdAt: string;
  updatedAt: string;
  attempts?: number;
  processingAt?: string;
  mediaReferences?: { version: 1; algorithm: 'aes-256-gcm'; iv: string; tag: string; ciphertext: string };
}

const handler = withErrorHandler(async (request: NextRequest) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  const auth = checkSharedSecret(process.env.CRON_SECRET?.trim(), token);
  if (auth !== 'ok') {
    if (auth !== 'not_configured') logSharedSecretRejection('privacy erasure scrubber', 'CRON_SECRET', auth);
    throw apiForbidden();
  }

  const db = await connectToDatabase();
  const receipts = db.collection<ErasureReceipt>(COLLECTIONS.PRIVACY_ERASURE_TOMBSTONES);
  const submissions = db.collection(COLLECTIONS.SUBMISSIONS);
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();

  // Recover the only cross-collection failure window: the source fence was
  // written but the intake could not persist its durable receipt. The same
  // resolver secret encrypts provider references; without it, leave the row
  // fenced and retry on a later cron invocation rather than lose media handles.
  let recoveredOrphanFences = 0;
  const configuredMediaKey = process.env.CAMERA_PRIVACY_MEDIA_KEY?.trim();
  const mediaReferenceKey = configuredMediaKey && Buffer.byteLength(configuredMediaKey, 'utf8') >= 32 ? configuredMediaKey : undefined;
  if (!mediaReferenceKey) {
    logWarn('privacy.camera_erasure.media_key_unavailable', 'Orphaned photo fences remain fenced until the media encryption key is configured', { phase: 'orphan_recovery' });
  }
  if (mediaReferenceKey) {
    const orphanFences = await submissions.aggregate<Document>([
      { $match: { 'privacyErasure.state': 'fenced' } },
      { $lookup: { from: COLLECTIONS.PRIVACY_ERASURE_TOMBSTONES, localField: '_id', foreignField: '_id', as: 'privacyReceipts' } },
      { $match: { privacyReceipts: { $eq: [] } } },
      { $sort: { updatedAt: 1, _id: 1 } },
      { $limit: BATCH_SIZE },
      { $project: { _id: 1, submissionId: 1, eventId: 1, eventIds: 1, privacyErasure: 1, imageUrl: 1, finalImageUrl: 1, originalImageUrl: 1, previewImageUrl: 1, screenImageUrl: 1, deleteUrl: 1, imageCopies: 1, photoReview: 1, tryOnRequest: 1 } },
    ]).toArray();
    for (const source of orphanFences) {
      const fence = source.privacyErasure && typeof source.privacyErasure === 'object' ? source.privacyErasure as Record<string, unknown> : {};
      if (typeof fence.requestId !== 'string') continue;
      const receipt: ErasureReceipt = {
        _id: source._id as ObjectId,
        requestId: fence.requestId,
        submissionId: typeof source.submissionId === 'string' ? source.submissionId : String(source._id),
        eventId: typeof source.eventId === 'string' ? source.eventId : null,
        status: 'fenced',
        createdAt: typeof fence.fencedAt === 'string' ? fence.fencedAt : now,
        updatedAt: now,
        mediaReferences: encryptMediaReferences(source, mediaReferenceKey) ?? undefined,
      };
      await receipts.updateOne({ _id: receipt._id }, { $setOnInsert: receipt }, { upsert: true });
      recoveredOrphanFences += 1;
    }
  }

  const due = await receipts.find({
    $or: [
      { status: 'fenced' },
      { status: 'processing', processingAt: { $lt: staleBefore } },
    ],
  }).sort({ createdAt: 1 }).limit(BATCH_SIZE).toArray();

  let recordErased = 0;
  let mediaPending = 0;
  let retryable = 0;
  let processed = 0;
  for (const receipt of due) {
    const claim = await receipts.updateOne(
      { _id: receipt._id, $or: [{ status: 'fenced' }, { status: 'processing', processingAt: { $lt: staleBefore } }] },
      { $set: { status: 'processing', processingAt: now, updatedAt: now }, $inc: { attempts: 1 } },
    );
    if (claim.modifiedCount !== 1) continue;
    try {
      const current = await submissions.findOne({ _id: receipt._id });
      let erasedAt = now;
      if (current) {
        const fence = current.privacyErasure && typeof current.privacyErasure === 'object'
          ? current.privacyErasure as Record<string, unknown>
          : null;
        if (fence?.state === 'record_erased' && fence.requestId === receipt.requestId) {
          erasedAt = typeof fence.recordErasedAt === 'string' ? fence.recordErasedAt : now;
        } else if (fence?.state !== 'fenced' || fence.requestId !== receipt.requestId) {
          throw new Error('source_fence_mismatch');
        } else {
          const replacement = minimalErasedSubmission({
            photoId: receipt._id,
            requestId: receipt.requestId,
            fencedAt: typeof fence.fencedAt === 'string' ? fence.fencedAt : receipt.createdAt,
            recordErasedAt: now,
          });
          const saved = await submissions.replaceOne(
            { _id: receipt._id, 'privacyErasure.state': 'fenced', 'privacyErasure.requestId': receipt.requestId },
            replacement,
          );
          if (saved.matchedCount !== 1) throw new Error('source_fence_lost');
        }
      }

      // Always send a scrubbed record through media reconciliation. A missing
      // handoff is an unresolved provider target, not proof that no file exists.
      const nextStatus = 'media_pending' as const;
      const completed = await receipts.updateOne(
        { _id: receipt._id, requestId: receipt.requestId, status: 'processing', processingAt: now },
        {
          $set: { status: nextStatus, recordErasedAt: erasedAt, updatedAt: now },
          $unset: { processingAt: '', errorCode: '' },
        },
      );
      if (completed.modifiedCount !== 1) throw new Error('receipt_update_lost');
      recordErased += 1;
      if (nextStatus === 'media_pending') mediaPending += 1;
      processed += 1;
    } catch {
      const latest = await receipts.findOne({ _id: receipt._id }, { projection: { attempts: 1 } });
      const attempts = typeof latest?.attempts === 'number' ? latest.attempts : MAX_ATTEMPTS;
      const nextStatus = attempts >= MAX_ATTEMPTS ? 'failed' : 'fenced';
      await receipts.updateOne(
        { _id: receipt._id, requestId: receipt.requestId, status: 'processing', processingAt: now },
        {
          $set: { status: nextStatus, errorCode: 'record_scrub_failed', updatedAt: new Date().toISOString() },
          $unset: { processingAt: '' },
        },
      );
      logWarn('privacy.camera_erasure.record_scrub_failed', 'A fenced photo record could not be scrubbed', {
        requestRef: receipt.requestId.slice(-8),
        photoRef: receipt._id.toHexString().slice(-8),
        errorCode: 'record_scrub_failed',
      });
      retryable += 1;
    }
  }

  return apiSuccess({ version: 1, recovered_orphan_fences: recoveredOrphanFences, processed, record_erased: recordErased, media_pending: mediaPending, retryable });
});

export const GET = handler;
export const POST = handler;
