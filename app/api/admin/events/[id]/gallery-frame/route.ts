/**
 * Admin-only: put the event's frame on photos that were uploaded to its gallery (camera#488, owner report 207).
 *
 * POST { submissionIds: string[] } (at most 25 at a time): for each photo of this event that an editor uploaded and that has no frame yet, the photo is cropped to a frame's
 * shape, the frame is laid over it (the same composition as a guest's photo) and the result replaces the picture; the plain upload is kept as `originalImageUrl`. Guest
 * photos are never touched (they were framed when they were taken), and a photo that already has a frame is skipped, so pressing twice does nothing the second time.
 * Answers which photos were framed (with their new picture) and which were skipped and why.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { uploadImage } from '@/lib/imgbb/upload';
import { fetchImageBuffer } from '@/lib/tryon/frame-composition';
import { frameGalleryPhoto, loadGalleryFrames, pickGalleryFrame, type GalleryFrameDeps } from '@/lib/gallery/frame';
import { ensureScreenPicture } from '@/lib/submissions/screen-picture';
import { runAfterResponse } from '@/lib/api/run-after-response';
import { logWarn } from '@/lib/observability/logger';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiNotFound } from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';

export const MAX_FRAMED_AT_ONCE = 25;

const defaultDeps: GalleryFrameDeps = {
  fetchImage: fetchImageBuffer,
  upload: async (data, name) => {
    const r = await uploadImage(data, { name });
    return { imageUrl: r.imageUrl, deleteUrl: r.deleteUrl, imageId: r.imageId, fileSize: r.fileSize, mimeType: r.mimeType };
  },
};

type Skipped = { id: string; reason: string };

export const POST = withErrorHandler(async (request: NextRequest, context?: { params?: Promise<{ id: string }> }) => {
  const session = await requireAuth(request);
  const { id: eventMongoId } = await context!.params!;
  if (!ObjectId.isValid(eventMongoId)) throw apiBadRequest('Invalid event id');

  const body = (await request.json().catch(() => null)) as { submissionIds?: unknown } | null;
  const ids = Array.isArray(body?.submissionIds) ? (body!.submissionIds as unknown[]).filter((v): v is string => typeof v === 'string' && ObjectId.isValid(v)) : [];
  if (ids.length === 0) throw apiBadRequest('submissionIds is required');
  if (ids.length > MAX_FRAMED_AT_ONCE) throw apiBadRequest(`At most ${MAX_FRAMED_AT_ONCE} photos at a time`);

  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, eventMongoId, 'manager');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventMongoId) });
  if (!event) throw apiNotFound('Event not found');
  const eventUuid = String(event.eventId);

  const frames = await loadGalleryFrames(db, event);
  if (frames.length === 0) throw apiBadRequest('The event has no frame yet. Add one on its Frames page first.');

  const rows = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .find({ _id: { $in: ids.map((v) => new ObjectId(v)) }, $or: [{ eventId: eventUuid }, { eventIds: { $in: [eventUuid] } }] })
    .toArray();

  const framed: Array<{ id: string; imageUrl: string }> = [];
  const skipped: Skipped[] = ids.filter((v) => !rows.some((r) => String(r._id) === v)).map((v) => ({ id: v, reason: 'not a photo of this event' }));

  for (const row of rows) {
    const id = String(row._id);
    const metadata = (row.metadata ?? {}) as { adminGalleryUpload?: boolean; galleryFrame?: boolean };
    if (metadata.adminGalleryUpload !== true) {
      skipped.push({ id, reason: 'only photos uploaded here can get a frame; guest photos were framed when they were taken' });
      continue;
    }
    if (metadata.galleryFrame === true) {
      skipped.push({ id, reason: 'already has a frame' });
      continue;
    }
    const sourceUrl = (row.originalImageUrl || row.imageUrl || row.finalImageUrl) as string | undefined;
    if (!sourceUrl) {
      skipped.push({ id, reason: 'no picture' });
      continue;
    }
    try {
      const frame = pickGalleryFrame(frames)!;
      const photo = await defaultDeps.fetchImage(sourceUrl);
      const upload = await frameGalleryPhoto(photo, frame, `admin-gallery-framed-${eventUuid}-${Date.now()}`, defaultDeps);
      await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
        { _id: row._id },
        {
          $set: {
            imageUrl: upload.imageUrl,
            finalImageUrl: upload.imageUrl,
            // The plain upload stays, as the original.
            originalImageUrl: sourceUrl,
            deleteUrl: upload.deleteUrl,
            imageId: upload.imageId,
            fileSize: upload.fileSize,
            mimeType: upload.mimeType,
            frameId: frame.frameId,
            frameName: frame.frameName,
            ...(frame.variant ? { frameVariant: frame.variant } : {}),
            'metadata.finalWidth': upload.width,
            'metadata.finalHeight': upload.height,
            'metadata.finalFileSize': upload.fileSize,
            'metadata.galleryFrame': true,
            updatedAt: generateTimestamp(),
          },
          // The screen picture was made from the unframed photo: it is made again from the framed one.
          $unset: { screenImageUrl: '', screenImageBytes: '' },
        }
      );
      runAfterResponse(async () => {
        await ensureScreenPicture(db, { _id: row._id, imageUrl: upload.imageUrl, finalImageUrl: upload.imageUrl });
      });
      framed.push({ id, imageUrl: upload.imageUrl });
    } catch (error) {
      logWarn('gallery.frame_failed', 'The frame could not be put on a gallery photo', { submissionId: id, error: error instanceof Error ? error.message : String(error) });
      skipped.push({ id, reason: 'the frame could not be added; the photo is unchanged' });
    }
  }

  return apiSuccess({ framed, skipped });
});
