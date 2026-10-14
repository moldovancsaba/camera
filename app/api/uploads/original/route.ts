/**
 * Upload token for the capture's event-scoped temporary images and the legacy full-frame original.
 *
 * The browser uploads the pure camera image straight to Vercel Blob (the original plus the
 * composite can exceed the 4.5 MB request-body limit of Vercel Functions). This public route only
 * hands out a short-lived upload token, and only for: an existing event, a path inside
 * `originals/<eventId>/`, a JPEG, at most ORIGINAL_MAX_BYTES, with a random suffix so the URL
 * cannot be guessed. POST /api/submissions later accepts the resulting URL only if it is inside
 * the same folder and passes a lookup. Nothing is uploaded through this function.
 *
 * The capture page uploads the full camera image at shutter time and the confirmed crop before a post-photo journey
 * page. Both use `capture-drafts/<eventId>/`; neither becomes part of the submission. The legacy `originals/` path is
 * still accepted for compatibility. RUNBOOK ("Full-frame originals") documents temporary-draft cleanup.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rateLimiter';
import { connectToDatabase } from '@/lib/db/mongodb';
import {
  ORIGINAL_ALLOWED_TYPE,
  ORIGINAL_MAX_BYTES,
  ORIGINAL_TOKEN_TTL_MS,
  isValidEventIdForPath,
  validateOriginalPathname,
  validateTemporaryCapturePathname,
} from '@/lib/submissions/original-image';
import { reportServerError } from '@/lib/observability/logger';

export const runtime = 'nodejs';

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    await checkRateLimit(request, RATE_LIMITS.ORIGINAL_UPLOAD_TOKEN);
  } catch {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body || typeof body !== 'object' || body.type !== 'blob.generate-client-token') {
    return badRequest('Invalid upload request');
  }

  try {
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let eventId: unknown;
        try {
          eventId = (JSON.parse(clientPayload ?? '{}') as { eventId?: unknown }).eventId;
        } catch {
          throw new Error('invalid_payload');
        }

        if (!isValidEventIdForPath(eventId) || (!validateOriginalPathname(pathname, eventId) && !validateTemporaryCapturePathname(pathname, eventId))) {
          throw new Error('invalid_path');
        }

        const db = await connectToDatabase();
        const event = await db.collection('events').findOne({ eventId }, { projection: { _id: 1 } });
        if (!event) {
          throw new Error('unknown_event');
        }

        return {
          allowedContentTypes: [ORIGINAL_ALLOWED_TYPE],
          maximumSizeInBytes: ORIGINAL_MAX_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + ORIGINAL_TOKEN_TTL_MS,
        };
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'invalid_payload' || message === 'invalid_path' || message === 'unknown_event') {
      return badRequest('Invalid upload request');
    }
    reportServerError('uploads.original_token', error);
    return NextResponse.json({ error: 'Could not prepare the upload' }, { status: 500 });
  }
}
