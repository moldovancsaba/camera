/**
 * Removes an unsubmitted camera original after a failed save or retake. The URL must belong to
 * this application's Blob store and this event. Permanent original paths are deleted only when
 * no submission still references the URL, protecting a save whose response was lost in transit.
 */

import { del } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rateLimiter';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { deleteOriginalBackupCopies } from '@/lib/storage/original-backups';
import { blobStoreHostFromToken, isTemporaryCaptureBlobUrl, isUnsubmittedOriginalBlobUrl } from '@/lib/submissions/original-image';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await checkRateLimit(request, RATE_LIMITS.ORIGINAL_UPLOAD_TOKEN);
  } catch {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { eventId?: unknown; url?: unknown } | null;
  const storeHost = blobStoreHostFromToken(process.env.BLOB_READ_WRITE_TOKEN);
  const url = typeof body?.url === 'string' ? body.url : null;
  if (!body || !url) return NextResponse.json({ error: 'Invalid temporary capture' }, { status: 400 });
  const temporary = body && url && isTemporaryCaptureBlobUrl(url, { eventId: body.eventId, storeHost });
  const original = body && url && isUnsubmittedOriginalBlobUrl(url, { eventId: body.eventId, storeHost });
  if (!temporary && !original) {
    return NextResponse.json({ error: 'Invalid temporary capture' }, { status: 400 });
  }

  try {
    if (original) {
      const db = await connectToDatabase();
      const referenced = await db.collection(COLLECTIONS.SUBMISSIONS).findOne({
        $or: [
          { originalImageUrl: url },
          { imageUrl: url },
          { finalImageUrl: url },
          { previewImageUrl: url },
          { screenImageUrl: url },
          { 'photoReview.photoUrl': url },
          { 'imageCopies.url': url },
        ],
      }, { projection: { _id: 1 } });
      if (referenced) return NextResponse.json({ success: true, retained: true });

      const assets = db.collection(COLLECTIONS.ORIGINAL_ASSETS);
      const asset = await assets.findOne({ eventId: body.eventId, url, state: { $ne: 'attached' } });
      if (asset) {
        // Callers only learn an original URL after Vercel's completion callback
        // verifies its R2 and ImgBB mirrors. Delete those copies first, then Blob;
        // keep the manifest if any provider cannot confirm deletion so retries work.
        await deleteOriginalBackupCopies(Array.isArray(asset.copies) ? asset.copies : []);
        await del(url);
        await assets.deleteOne({ _id: asset._id, url, state: { $ne: 'attached' } });
        return NextResponse.json({ success: true });
      }
    }
    await del(url ?? '');
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Could not remove the temporary capture' }, { status: 502 });
  }
}
