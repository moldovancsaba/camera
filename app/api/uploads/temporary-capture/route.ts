/**
 * Removes an unsubmitted, temporary camera original after a retake, a completed save, or an
 * abandoned capture page. The URL is accepted only for the event's random `capture-drafts/`
 * path in this application's Blob store; it cannot name a submitted image or another event's file.
 */

import { del } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rateLimiter';
import { blobStoreHostFromToken, isTemporaryCaptureBlobUrl } from '@/lib/submissions/original-image';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await checkRateLimit(request, RATE_LIMITS.ORIGINAL_UPLOAD_TOKEN);
  } catch {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { eventId?: unknown; url?: unknown } | null;
  const storeHost = blobStoreHostFromToken(process.env.BLOB_READ_WRITE_TOKEN);
  if (!body || !isTemporaryCaptureBlobUrl(body.url, { eventId: body.eventId, storeHost })) {
    return NextResponse.json({ error: 'Invalid temporary capture' }, { status: 400 });
  }

  try {
    await del(body.url);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Could not remove the temporary capture' }, { status: 502 });
  }
}
