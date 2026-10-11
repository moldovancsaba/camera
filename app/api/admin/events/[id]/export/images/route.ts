/**
 * Event Images Export
 *
 * GET /api/admin/events/[id]/export/images?format=csv|zip
 * - format=csv (default): a CSV of every image URL related to the event
 *   (originals and finals; also any stored try-on result of an event that ran the removed try-on integration) with metadata. Uncapped.
 * - format=zip: streams a .zip of the actual image files fetched from imgbb.
 *   Capped at MAX_ZIP_IMAGES; larger events must use the CSV and bulk-download
 *   externally.
 *
 * Access: partner-scoped Events manager (or global admin). 403 otherwise,
 * 404 when the event does not exist.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { withErrorHandler, requireAuth, apiNotFound, apiBadRequest } from '@/lib/api';
import { assertPartnerEventAccess } from '@/lib/partners/authorization';
import {
  loadEventForExport,
  collectEventSubmissionsForExport,
  collectEventImages,
  toCsv,
  exportSlug,
  MAX_ZIP_IMAGES,
} from '@/lib/events/event-export';
import { createImagesZip } from '@/lib/events/image-zip';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await requireAuth(request);
  const { id } = await context.params;
  const format = request.nextUrl.searchParams.get('format') === 'zip' ? 'zip' : 'csv';

  const db = await connectToDatabase();
  const event = await loadEventForExport(db, id);
  if (!event) {
    throw apiNotFound('Event not found');
  }
  // Bulk export is a manage-level action (global admins are auto-allowed).
  await assertPartnerEventAccess(db, session, id, 'manager');

  const submissions = await collectEventSubmissionsForExport(db, event.eventId);
  const images = collectEventImages(submissions);
  const date = new Date().toISOString().slice(0, 10);
  const baseName = `event-${exportSlug(event.name)}-images-${date}`;

  if (format === 'csv') {
    const csv = toCsv(
      ['submission_id', 'kind', 'submission_kind', 'url', 'user_email', 'user_name', 'created_at'],
      images.map((image) => [
        image.submissionId,
        image.kind,
        image.submissionKind,
        image.url,
        image.userEmail,
        image.userName,
        image.createdAt,
      ])
    );
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${baseName}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // ZIP: guard the size before we start streaming so we can still return a clean
  // JSON error with the right status instead of a half-written archive.
  if (images.length === 0) {
    throw apiBadRequest('This event has no images to export');
  }
  if (images.length > MAX_ZIP_IMAGES) {
    throw apiBadRequest(
      `This event has ${images.length} images, which exceeds the ${MAX_ZIP_IMAGES}-file ZIP limit. ` +
        'Use the CSV export to retrieve every image URL and download them in bulk.'
    );
  }

  // The archive is built (and streamed as the client reads it) by lib/events/image-zip.ts; a failed picture goes into _errors.txt.
  const body = createImagesZip(images);
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${baseName}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
});
