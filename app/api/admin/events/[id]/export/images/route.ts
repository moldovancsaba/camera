/**
 * Event Images Export
 *
 * GET /api/admin/events/[id]/export/images?format=csv|zip&kind=all|original|final
 * POST /api/admin/events/[id]/export/images (manager-only selected-photo ZIP)
 * - format=csv (default): a CSV of every image URL related to the event
 *   (originals and finals; also any stored try-on result of an event that ran the removed try-on integration) with metadata. Uncapped.
 * - format=zip: streams a .zip of the actual image files fetched from their stored image hosts.
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
  eventImageForSubmission,
  toCsv,
  exportSlug,
  MAX_ZIP_IMAGES,
  type ExportSubmission,
} from '@/lib/events/event-export';
import { createImagesZip } from '@/lib/events/image-zip';
import { galleryFilter } from '@/lib/gallery/submissions';
import { COLLECTIONS } from '@/lib/db/schemas';
import { ObjectId } from 'mongodb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const GET = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await requireAuth(request);
  const { id } = await context.params;
  const format = request.nextUrl.searchParams.get('format') === 'zip' ? 'zip' : 'csv';
  const requestedKind = request.nextUrl.searchParams.get('kind') ?? 'all';
  if (requestedKind !== 'all' && requestedKind !== 'original' && requestedKind !== 'final') {
    throw apiBadRequest('Image kind must be all, original, or final');
  }

  const db = await connectToDatabase();
  const event = await loadEventForExport(db, id);
  if (!event) {
    throw apiNotFound('Event not found');
  }
  // Bulk export is a manage-level action (global admins are auto-allowed).
  await assertPartnerEventAccess(db, session, id, 'manager');

  const submissions = await collectEventSubmissionsForExport(db, event.eventId);
  const images = collectEventImages(submissions, requestedKind === 'all' ? undefined : requestedKind);
  const date = new Date().toISOString().slice(0, 10);
  const kindName = requestedKind === 'original' ? '-original' : requestedKind === 'final' ? '-framed' : '';
  const baseName = `event-${exportSlug(event.name)}${kindName}-images-${date}`;

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

  // The archive is built (and streamed as the client reads it) by lib/events/image-zip.ts; failed and budget-skipped pictures are listed in manifests.
  const body = createImagesZip(images);
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${baseName}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
});

/** Build a ZIP of a manager's currently selected, gallery-eligible image renditions. */
export const POST = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await requireAuth(request);
  const { id } = await context.params;
  const db = await connectToDatabase();
  const event = await loadEventForExport(db, id);
  if (!event) throw apiNotFound('Event not found');
  await assertPartnerEventAccess(db, session, id, 'manager');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw apiBadRequest('Submit a valid image-export form');
  }
  const rawKind = form.get('kind');
  const kind = rawKind === 'original' || rawKind === 'final' ? rawKind : null;
  if (!kind) throw apiBadRequest('Choose original or framed photos');

  const rawIds = form.getAll('submissionIds');
  if (rawIds.length === 0 || rawIds.length > MAX_ZIP_IMAGES || rawIds.some((value) => typeof value !== 'string' || !ObjectId.isValid(value))) {
    throw apiBadRequest(`Select between 1 and ${MAX_ZIP_IMAGES} valid photos`);
  }
  const ids = Array.from(new Set(rawIds.map((value) => (value as string).trim())));
  if (ids.length !== rawIds.length) throw apiBadRequest('The selection contains duplicate photo IDs');

  const eligible = await galleryFilter(event.eventId);
  const rows = await db.collection(COLLECTIONS.SUBMISSIONS)
    .find({ $and: [eligible, { _id: { $in: ids.map((value) => new ObjectId(value)) } }] })
    .project({
      _id: 1,
      submissionId: 1,
      userEmail: 1,
      userName: 1,
      userInfo: 1,
      createdAt: 1,
      submissionKind: 1,
      frameId: 1,
      reframe: 1,
      photoReview: 1,
      imageCopies: 1,
      metadata: 1,
      imageUrl: 1,
      originalImageUrl: 1,
      finalImageUrl: 1,
    })
    .toArray() as ExportSubmission[];
  if (rows.length !== ids.length) {
    throw apiBadRequest('Some selected photos are no longer eligible for the event gallery. Refresh the gallery and select again.');
  }

  const byId = new Map(rows.map((row) => [row._id?.toString(), row]));
  const ordered = ids.map((submissionId) => byId.get(submissionId)).filter((row): row is ExportSubmission => Boolean(row));
  const images = ordered.flatMap((row) => {
    const image = eventImageForSubmission(row, kind);
    return image ? [image] : [];
  });
  const missingOriginals = kind === 'original'
    ? ordered.filter((row) => !eventImageForSubmission(row, 'original')).map((row) => `Photo ${row.submissionId ?? row._id?.toString() ?? 'unknown'}: no unframed original is retained.`)
    : [];
  if (images.length === 0 && missingOriginals.length === 0) {
    throw apiBadRequest('None of the selected photos have a saved image for this export.');
  }

  const date = new Date().toISOString().slice(0, 10);
  const kindName = kind === 'original' ? 'original' : 'framed';
  const filename = `event-${exportSlug(event.name)}-${kindName}-selected-${date}.zip`;
  return new NextResponse(createImagesZip(images, undefined, missingOriginals), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});
