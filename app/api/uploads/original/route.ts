/**
 * Upload token for the full-frame original (camera#210).
 *
 * The browser uploads the pure camera image straight to Vercel Blob (the original plus the
 * composite can exceed the 4.5 MB request-body limit of Vercel Functions). This public route only
 * hands out a short-lived upload token, and only for: an existing event, a path inside
 * `originals/<eventId>/`, a JPEG, at most ORIGINAL_MAX_BYTES, with a random suffix so the URL
 * cannot be guessed. POST /api/submissions later accepts the resulting URL only if it is inside
 * the same folder and passes a lookup. Nothing is uploaded through this function.
 *
 * Event capture uses this route after the participant confirms the crop, then attaches the verified source URL to
 * the submission. The URL is not returned by guest-facing submission APIs; managers and the Fanmass analysis flow
 * use it for review. See RUNBOOK ("Full-frame originals") for its lifecycle and storage limits.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { head } from '@vercel/blob';
import { ObjectId } from 'mongodb';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rateLimiter';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { fetchImageBuffer } from '@/lib/media/image-buffer';
import { createRequiredOriginalBackups, deleteOriginalBackupCopies, OriginalBackupError } from '@/lib/storage/original-backups';
import type { ImageCopy } from '@/lib/db/schemas';
import {
  ORIGINAL_ALLOWED_TYPE,
  ORIGINAL_MAX_BYTES,
  ORIGINAL_TOKEN_TTL_MS,
  isOriginalBlobUrl,
  isValidEventIdForPath,
  blobStoreHostFromToken,
  validateOriginalPathname,
  validateTemporaryCapturePathname,
} from '@/lib/submissions/original-image';
import { reportServerError } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const maxDuration = 120;

function originalUploadIdentity(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
}

function callbackPayload(value: string | null | undefined): { eventId: string; captureId: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { eventId?: unknown; captureId?: unknown };
    return isValidEventIdForPath(parsed.eventId) && originalUploadIdentity(parsed.captureId)
      ? { eventId: parsed.eventId, captureId: parsed.captureId }
      : null;
  } catch {
    return null;
  }
}

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body || typeof body !== 'object' || (body.type !== 'blob.generate-client-token' && body.type !== 'blob.upload-completed')) {
    return badRequest('Invalid upload request');
  }
  // Completion callbacks are already authenticated by Vercel Blob's signature
  // inside handleUpload. Rate-limit only public token issuance so bursts of
  // legitimate uploads do not suppress backup replication callbacks.
  if (body.type === 'blob.generate-client-token') {
    try {
      await checkRateLimit(request, RATE_LIMITS.ORIGINAL_UPLOAD_TOKEN);
    } catch {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
  }

  try {
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let eventId: unknown;
        let captureId: unknown;
        try {
          const parsed = JSON.parse(clientPayload ?? '{}') as { eventId?: unknown; captureId?: unknown };
          eventId = parsed.eventId;
          captureId = parsed.captureId;
        } catch {
          throw new Error('invalid_payload');
        }

        if (!isValidEventIdForPath(eventId) || (!validateOriginalPathname(pathname, eventId) && !validateTemporaryCapturePathname(pathname, eventId))) {
          throw new Error('invalid_path');
        }
        if (validateOriginalPathname(pathname, eventId) && !originalUploadIdentity(captureId)) {
          throw new Error('invalid_capture_id');
        }
        if (validateOriginalPathname(pathname, eventId) && pathname !== `originals/${eventId}/${String(captureId)}.jpg`) {
          throw new Error('invalid_path');
        }

        const db = await connectToDatabase();
        const event = await db.collection('events').findOne({ eventId }, { projection: { _id: 1, isActive: 1 } });
        if (!event || event.isActive === false) {
          throw new Error('unknown_event');
        }

        return {
          allowedContentTypes: [ORIGINAL_ALLOWED_TYPE],
          maximumSizeInBytes: ORIGINAL_MAX_BYTES,
          // The path is the stable capture id, so a browser retry targets the
          // same Blob object instead of creating an untraceable duplicate.
          addRandomSuffix: false,
          allowOverwrite: true,
          validUntil: Date.now() + ORIGINAL_TOKEN_TTL_MS,
          tokenPayload: validateOriginalPathname(pathname, eventId)
            ? JSON.stringify({ eventId, captureId })
            : JSON.stringify({ eventId }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const identity = callbackPayload(tokenPayload);
        // Temporary captures are not durable original assets and remain subject
        // to their existing cleanup path.
        if (!identity || !validateOriginalPathname(blob.pathname, identity.eventId)) return;
        const storeHost = blobStoreHostFromToken(process.env.BLOB_READ_WRITE_TOKEN);
        if (!isOriginalBlobUrl(blob.url, { eventId: identity.eventId, storeHost })) {
          throw new Error('Completed original is not in Camera’s event Blob path');
        }
        const blobInfo = await head(blob.url);
        if (blobInfo.size <= 0 || blobInfo.size > ORIGINAL_MAX_BYTES || blobInfo.contentType !== ORIGINAL_ALLOWED_TYPE) {
          throw new Error('Completed original failed Blob size or content-type verification');
        }

        const db = await connectToDatabase();
        const events = db.collection(COLLECTIONS.EVENTS);
        const event = await events.findOne({ eventId: identity.eventId }, { projection: { _id: 1, isActive: 1 } });
        const assets = db.collection(COLLECTIONS.ORIGINAL_ASSETS);
        const assetId = new ObjectId(identity.captureId);
        const now = new Date().toISOString();
        const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        if (!event || event.isActive === false) {
          await assets.updateOne(
            { _id: assetId },
            { $set: { eventId: identity.eventId, url: blob.url, pathname: blob.pathname, state: 'failed', copies: [], bytes: blobInfo.size, lastError: 'event_unavailable', expiresAt: expiry, updatedAt: now } },
            { upsert: true },
          );
          throw new Error('The event is no longer available');
        }
        try {
          await assets.updateOne(
            { _id: assetId },
            { $setOnInsert: { eventId: identity.eventId, url: blob.url, pathname: blob.pathname, state: 'ready', copies: [], bytes: blobInfo.size, expiresAt: expiry, createdAt: now, updatedAt: now } },
            { upsert: true },
          );
        } catch (error) {
          // A simultaneous callback may have created this capture first.
          const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : null;
          if (code !== 11000) throw error;
        }
        const existing = await assets.findOne({ _id: assetId });
        if (existing && (existing.eventId !== identity.eventId || existing.url !== blob.url)) {
          throw new Error('Original capture identity was already used for another upload');
        }
        const existingCopies = Array.isArray(existing?.copies) ? existing.copies as ImageCopy[] : [];
        if ((existing?.state === 'verified' || existing?.state === 'attached')
          && existingCopies.length === 3
          && ['blob', 'r2', 'imgbb'].every((store) => existingCopies.some((copy) => copy.role === 'original' && copy.store === store && copy.state === 'verified' && copy.bytes === blobInfo.size))) return;

        const replicationStartedAt = new Date().toISOString();
        const claimed = await assets.updateOne(
          {
            _id: assetId,
            eventId: identity.eventId,
            url: blob.url,
            $or: [
              { state: { $in: ['ready', 'failed', 'cleanup_failed', 'verified'] } },
              { state: 'replicating', startedAt: { $lte: new Date(Date.now() - 150_000).toISOString() } },
            ],
          },
          { $set: { state: 'replicating', pathname: blob.pathname, startedAt: replicationStartedAt, expiresAt: expiry, updatedAt: replicationStartedAt } },
        );
        if (claimed.modifiedCount !== 1) {
          throw new Error('Original replication is already in progress');
        }
        let verifiedCopies: ImageCopy[] = [];
        let previousCopiesCleared = existingCopies.length === 0;
        try {
          // A previous attempt can have created one secondary copy and failed to
          // roll it back. Remove those recorded remnants before a retry so each
          // capture has one deterministic R2 object and one ImgBB asset.
          if (existingCopies.length > 0) {
            await deleteOriginalBackupCopies(existingCopies);
            await assets.updateOne(
              { _id: assetId, state: 'replicating', startedAt: replicationStartedAt },
              { $set: { copies: [], updatedAt: replicationStartedAt } },
            );
            previousCopiesCleared = true;
          }
          const bytes = await fetchImageBuffer(blob.url);
          if (bytes.byteLength !== blobInfo.size) throw new Error('Completed original read-back size did not match Blob metadata');
          verifiedCopies = await createRequiredOriginalBackups({
            eventId: identity.eventId,
            submissionId: identity.captureId,
            sourceUrl: blob.url,
            bytes,
            now,
          });
          await assets.updateOne(
            { _id: assetId, state: 'replicating', startedAt: replicationStartedAt },
            { $set: { state: 'verified', bytes: bytes.byteLength, copies: verifiedCopies, verifiedAt: replicationStartedAt, updatedAt: replicationStartedAt }, $unset: { startedAt: '' } },
          );
        } catch (error) {
          const saved = await assets.findOne({ _id: assetId, eventId: identity.eventId, url: blob.url, state: { $in: ['verified', 'attached'] } });
          if (saved && Array.isArray(saved.copies) && saved.copies.length === 3) return;
          let cleanupPendingCopies = error instanceof OriginalBackupError ? error.cleanupPendingCopies : [];
          if (!previousCopiesCleared && existingCopies.length > 0) cleanupPendingCopies = existingCopies;
          if (verifiedCopies.length) {
            try {
              await deleteOriginalBackupCopies(verifiedCopies);
            } catch {
              cleanupPendingCopies = verifiedCopies.filter((copy) => copy.store !== 'blob');
            }
          }
          const failedAt = new Date().toISOString();
          await assets.updateOne(
            { _id: assetId, state: 'replicating', startedAt: replicationStartedAt },
            {
              $set: {
                state: cleanupPendingCopies.length ? 'cleanup_failed' : 'failed',
                bytes: blobInfo.size,
                copies: cleanupPendingCopies,
                ...(cleanupPendingCopies.length ? { nextCleanupAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() } : {}),
                lastError: error instanceof Error ? error.name : 'unknown_storage_failure',
                updatedAt: failedAt,
              },
              $unset: { startedAt: '', ...(!cleanupPendingCopies.length ? { nextCleanupAt: '' } : {}) },
            },
          );
          throw error;
        }
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'invalid_payload' || message === 'invalid_path' || message === 'invalid_capture_id' || message === 'unknown_event') {
      return badRequest('Invalid upload request');
    }
    reportServerError('uploads.original_token', error);
    return NextResponse.json({ error: 'Could not prepare the upload' }, { status: 500 });
  }
}
