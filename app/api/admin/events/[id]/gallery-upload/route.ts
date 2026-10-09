/**
 * Admin-only: upload an existing image file into an event's gallery (new submission).
 *
 * POST multipart/form-data: file (required), imageWidth, imageHeight (optional, from client probe), withFrame ('1': put the event's frame on the photo, camera#488)
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { uploadImage } from '@/lib/imgbb/upload';
import { fetchImageBuffer } from '@/lib/tryon/frame-composition';
import { frameGalleryPhoto, loadGalleryFrames, pickGalleryFrame, type FramedUpload, type GalleryFrame } from '@/lib/gallery/frame';
import { ensureScreenPicture } from '@/lib/submissions/screen-picture';
import { runAfterResponse } from '@/lib/api/run-after-response';
import { logWarn } from '@/lib/observability/logger';
import {
  withErrorHandler,
  requireAuth,
  apiCreated,
  apiBadRequest,
  apiNotFound,
  checkRateLimit,
} from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';

const MAX_BYTES = 32 * 1024 * 1024; // imgbb limit
const ADMIN_GALLERY_UPLOAD_RATE_LIMIT = {
  max: 60,
  windowMs: 60 * 1000,
  message: 'Too many gallery uploads. Please wait a minute and try again.',
};

export const POST = withErrorHandler(
  async (
    request: NextRequest,
    context?: { params?: Promise<{ id: string }> }
  ) => {
    const session = await requireAuth(request);
    await checkRateLimit(request, ADMIN_GALLERY_UPLOAD_RATE_LIMIT);

    const { id: eventMongoId } = await context!.params!;

    if (!ObjectId.isValid(eventMongoId)) {
      throw apiBadRequest('Invalid event id');
    }

    const db = await connectToDatabase();
    await assertGlobalAdminOrPartnerEventAccess(db, session, eventMongoId, 'manager');

    const formData = await request.formData();
    const file = formData.get('file');
    const widthRaw = formData.get('imageWidth');
    const heightRaw = formData.get('imageHeight');

    if (!file || typeof file === 'string') {
      throw apiBadRequest('Image file is required');
    }

    if (!(file instanceof File)) {
      throw apiBadRequest('Invalid file upload');
    }

    if (!file.type.startsWith('image/')) {
      throw apiBadRequest('File must be an image');
    }

    if (file.size > MAX_BYTES) {
      throw apiBadRequest(`Image must be under ${MAX_BYTES / 1024 / 1024} MB`);
    }

    const imageWidth =
      widthRaw != null && widthRaw !== ''
        ? Math.max(1, parseInt(String(widthRaw), 10) || 0)
        : 0;
    const imageHeight =
      heightRaw != null && heightRaw !== ''
        ? Math.max(1, parseInt(String(heightRaw), 10) || 0)
        : 0;

    const event = await db
      .collection(COLLECTIONS.EVENTS)
      .findOne({ _id: new ObjectId(eventMongoId) });

    if (!event) {
      throw apiNotFound('Event not found');
    }

    const partner = event.partnerId
      ? await db
          .collection(COLLECTIONS.PARTNERS)
          .findOne({ partnerId: event.partnerId })
      : null;

    const eventUuid = event.eventId as string;
    const now = generateTimestamp();

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');

    const uploadResult = await uploadImage(base64, {
      name: `admin-gallery-${eventUuid}-${Date.now()}`,
    });

    // The event's frame on the photo, when the editor asked (camera#488): the photo is cropped to the frame's shape and the frame laid over it as for a guest's photo. The
    // plain upload above is kept as the original; if the frame cannot be added the photo is added without it and the answer says so.
    let framed: { frame: GalleryFrame; upload: FramedUpload } | null = null;
    let frameNote: string | null = null;
    if (formData.get('withFrame') === '1') {
      try {
        const frame = pickGalleryFrame(await loadGalleryFrames(db, event));
        if (frame) {
          framed = {
            frame,
            upload: await frameGalleryPhoto(buffer, frame, `admin-gallery-framed-${eventUuid}-${Date.now()}`, {
              fetchImage: fetchImageBuffer,
              upload: async (data, name) => {
                const r = await uploadImage(data, { name });
                return { imageUrl: r.imageUrl, deleteUrl: r.deleteUrl, imageId: r.imageId, fileSize: r.fileSize, mimeType: r.mimeType };
              },
            }),
          };
        } else {
          frameNote = 'The event has no frame yet, so the photo was added without one.';
        }
      } catch (error) {
        logWarn('gallery.frame_failed', 'The frame could not be put on an uploaded photo; it was added without', { eventId: eventUuid, error: error instanceof Error ? error.message : String(error) });
        frameNote = 'The frame could not be added, so the photo was added without one.';
      }
    }

    const adminLabel =
      session.user.name || session.user.email || 'Admin';

    const submission = {
      userId: session.user.id,
      userEmail: session.user.email || 'admin@upload',
      userName: `${adminLabel} (gallery upload)`,
      frameId: framed?.frame.frameId ?? null,
      frameName: framed?.frame.frameName ?? null,
      frameCategory: null,
      ...(framed?.frame.variant ? { frameVariant: framed.frame.variant } : {}),
      partnerId: (event.partnerId as string) || null,
      partnerName: (partner?.name as string) || null,
      eventId: eventUuid,
      eventIds: [eventUuid],
      eventName: (event.name as string) || null,
      imageUrl: framed?.upload.imageUrl ?? uploadResult.imageUrl,
      finalImageUrl: framed?.upload.imageUrl ?? uploadResult.imageUrl,
      // The plain upload stays the original when a frame was put on it.
      ...(framed ? { originalImageUrl: uploadResult.imageUrl } : {}),
      deleteUrl: framed?.upload.deleteUrl ?? uploadResult.deleteUrl,
      imageId: framed?.upload.imageId ?? uploadResult.imageId,
      fileSize: framed?.upload.fileSize ?? uploadResult.fileSize,
      mimeType: framed?.upload.mimeType ?? uploadResult.mimeType,
      consents: [] as unknown[],
      isArchived: false,
      shareCount: 0,
      downloadCount: 0,
      playCount: 0,
      hiddenFromPartner: false,
      hiddenFromEvents: [] as string[],
      metadata: {
        device: request.headers.get('user-agent'),
        ip:
          request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip'),
        finalFileSize: framed?.upload.fileSize ?? uploadResult.fileSize,
        finalWidth: framed?.upload.width ?? (imageWidth || 1920),
        finalHeight: framed?.upload.height ?? (imageHeight || 1080),
        adminGalleryUpload: true,
        ...(framed ? { galleryFrame: true } : {}),
        adminUploadedBy: session.user.id,
        adminUploadedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    };

    const result = await db
      .collection(COLLECTIONS.SUBMISSIONS)
      .insertOne(submission);

    // The screen-sized picture for the giant screen, after the answer (camera#476, S7).
    runAfterResponse(async () => {
      await ensureScreenPicture(db, { _id: result.insertedId, imageUrl: submission.imageUrl, finalImageUrl: submission.finalImageUrl });
    });

    return apiCreated({
      submission: {
        ...submission,
        _id: result.insertedId.toString(),
      },
      framed: framed !== null,
      frameNote,
    });
  }
);
