import { NextRequest, NextResponse } from 'next/server';
import { apiNotFound, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { assertInternalFanmassSecret } from '@/lib/fanmass/internal';
import { buildMediaFeedEligibilityMatch } from '@/lib/fanmass/media-feed';
import { isBlobStorageHostname } from '@/lib/imgbb/url';

const MAX_MEDIA_BYTES = 32 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff']);

/** Authenticated, lease-bound image retrieval. The storage URL is never returned to Fanmass. */
export const GET = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ eventId: string; captureId: string }> },
) => {
  assertInternalFanmassSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_READ);

  const { eventId, captureId } = await context.params;
  const leaseToken = request.headers.get('x-fanmass-lease')?.trim() || '';
  if (!leaseToken) throw apiNotFound('Claimed Fanmass media');

  const db = await connectToDatabase();
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ eventId, isActive: { $ne: false } }, { projection: { eventId: 1 } });
  if (!event) throw apiNotFound('Claimed Fanmass media');

  const nowIso = new Date().toISOString();
  const submission = await db.collection(COLLECTIONS.SUBMISSIONS).findOne({
    $and: [
      buildMediaFeedEligibilityMatch(eventId),
      { submissionId: captureId },
      {
        fanmassIntakeByEvent: {
          $elemMatch: { eventId, status: 'claimed', leaseToken, leaseUntil: { $gt: nowIso } },
        },
      },
    ],
  }, { projection: { originalImageUrl: 1, imageUrl: 1, finalImageUrl: 1 } });
  // Preserve the older feed behavior for approved legacy records that predate
  // stored full-frame originals. New submissions still use the unframed original.
  const imageUrl = [submission?.originalImageUrl, submission?.imageUrl, submission?.finalImageUrl]
    .find((value) => typeof value === 'string' && value.length > 0) || '';
  if (!imageUrl) throw apiNotFound('Claimed Fanmass media');

  let source: URL;
  try {
    source = new URL(imageUrl);
  } catch {
    throw apiNotFound('Claimed Fanmass media');
  }
  const allowedHost = source.hostname === 'i.ibb.co' || isBlobStorageHostname(source.hostname);
  if (source.protocol !== 'https:' || source.username || source.password || !allowedHost) {
    throw apiNotFound('Claimed Fanmass media');
  }

  const upstream = await fetch(source, {
    headers: { Accept: 'image/*' },
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  const contentType = upstream.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() || '';
  const contentLength = Number(upstream.headers.get('content-length') || 0);
  if (!upstream.ok || !ALLOWED_MEDIA_TYPES.has(contentType) || contentLength > MAX_MEDIA_BYTES) {
    return new NextResponse(null, { status: upstream.ok ? 413 : 502, headers: { 'Cache-Control': 'private, no-store' } });
  }
  const reader = upstream.body?.getReader();
  if (!reader) return new NextResponse(null, { status: 502, headers: { 'Cache-Control': 'private, no-store' } });
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_MEDIA_BYTES) {
      await reader.cancel();
      return new NextResponse(null, { status: 413, headers: { 'Cache-Control': 'private, no-store' } });
    }
    chunks.push(value);
  }
  if (totalBytes === 0) return new NextResponse(null, { status: 502, headers: { 'Cache-Control': 'private, no-store' } });
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(totalBytes),
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
