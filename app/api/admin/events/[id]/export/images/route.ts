/**
 * Event Images Export
 *
 * GET /api/admin/events/[id]/export/images?format=csv|zip
 * - format=csv (default): a CSV of every image URL related to the event
 *   (originals, finals, and derived try-on results) with metadata. Uncapped.
 * - format=zip: streams a .zip of the actual image files fetched from imgbb.
 *   Capped at MAX_ZIP_IMAGES; larger events must use the CSV and bulk-download
 *   externally.
 *
 * Access: partner-scoped Events manager (or global admin). 403 otherwise,
 * 404 when the event does not exist.
 */

import { Readable } from 'node:stream';
import archiver from 'archiver';
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
  imageExtension,
  MAX_ZIP_IMAGES,
} from '@/lib/events/event-export';

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

  const archive = archiver('zip', { zlib: { level: 6 } });

  // Drive fetch + append in the background; archiver streams out as the client
  // reads. A per-image failure is recorded in _errors.txt rather than aborting.
  (async () => {
    const failures: string[] = [];
    const usedNames = new Set<string>();
    let index = 0;

    for (const image of images) {
      index += 1;
      try {
        const response = await fetch(image.url);
        if (!response.ok) {
          failures.push(`${image.url} -> HTTP ${response.status}`);
          continue;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        const ext = imageExtension(response.headers.get('content-type'), image.url);
        const prefix = String(index).padStart(4, '0');
        let name = `${image.kind}/${prefix}-${image.submissionId || 'image'}.${ext}`;
        // Guard against the rare collision when two submissions share an id.
        while (usedNames.has(name)) {
          name = `${image.kind}/${prefix}-${image.submissionId || 'image'}-${usedNames.size}.${ext}`;
        }
        usedNames.add(name);
        archive.append(buffer, { name });
      } catch (error) {
        failures.push(`${image.url} -> ${error instanceof Error ? error.message : 'fetch failed'}`);
      }
    }

    if (failures.length > 0) {
      archive.append(
        `${failures.length} image(s) could not be fetched:\n\n${failures.join('\n')}\n`,
        { name: '_errors.txt' }
      );
    }
    await archive.finalize();
  })().catch((error) => {
    archive.abort();
    console.error('Event image ZIP export failed:', error);
  });

  // Node Readable -> Web ReadableStream for the App Router Response body.
  const body = Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>;
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${baseName}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
});
