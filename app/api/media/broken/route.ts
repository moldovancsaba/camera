/**
 * A screen or page that could not load a picture says so (lib/media/broken.ts, owner 2026-10-09: a picture that cannot be shown is hidden, never shown as an error).
 *
 * POST /api/media/broken   { submissionId }  -> { outcome }
 *   Public (the giant screen is not signed in). The server never takes the caller's word for it: it asks the picture's own host, and only a clear "gone" (404, 410, not an image) marks the
 *   submission broken, which takes it out of every screen, gallery, share page and feed at once. A fresh answer is not asked for again for a minute, and the route is rate limited.
 */

import { NextRequest } from 'next/server';
import { apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { reportBroken } from '@/lib/media/broken';

export const maxDuration = 20;

export const POST = withErrorHandler(async (request: NextRequest) => {
  await checkRateLimit(request, RATE_LIMITS.MEDIA_REPORT);
  const body = (await request.json().catch(() => ({}))) as { submissionId?: unknown };
  const db = await connectToDatabase();
  return apiSuccess({ outcome: await reportBroken(db, body.submissionId, new Date().toISOString()) });
});
